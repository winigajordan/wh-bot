import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaudeService } from '../../ai/claude/claude.service';
import { isUuid } from '../../common/uuid.util';
import { MenuExtraction } from './entities/menu-extraction.entity';
import type {
  ExtractedMenuCategory,
  ExtractedMenuItem,
  ExtractedMenuPayload,
  MenuExtractionDto,
} from './menu-extraction.types';
import { MenuService } from './menu.service';

const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const);

type AllowedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

@Injectable()
export class MenuExtractionService {
  private readonly logger = new Logger(MenuExtractionService.name);

  constructor(
    @InjectRepository(MenuExtraction)
    private readonly extractionRepo: Repository<MenuExtraction>,
    private readonly claude: ClaudeService,
    private readonly menuService: MenuService,
  ) {}

  async createFromUpload(
    businessId: string,
    files: Array<{
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    }>,
  ): Promise<MenuExtractionDto> {
    if (!files.length) {
      throw new BadRequestException('Au moins une image requise');
    }
    if (files.length > 5) {
      throw new BadRequestException('Maximum 5 images par import');
    }

    const prepared: Array<{
      mediaType: AllowedMediaType;
      base64: string;
      filename: string | null;
    }> = [];

    for (const file of files) {
      const mediaType = this.resolveMediaType(file.mimetype, file.originalname);
      if (!mediaType) {
        throw new BadRequestException(
          `Format non supporté (${file.originalname || 'fichier'}). JPEG, PNG, WebP ou GIF uniquement.`,
        );
      }
      if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
        throw new BadRequestException(
          `Fichier trop volumineux (${file.originalname || 'image'}, max 8 Mo)`,
        );
      }
      prepared.push({
        mediaType,
        base64: file.buffer.toString('base64'),
        filename: file.originalname?.trim() || null,
      });
    }

    let rawText = '';
    let parsed: unknown;
    try {
      const result = await this.claude.extractMenuFromImages(
        prepared.map((entry) => ({
          mediaType: entry.mediaType,
          base64: entry.base64,
        })),
      );
      rawText = result.rawText;
      parsed = result.parsed;
    } catch (error) {
      this.logger.error(
        `Extraction Vision échouée: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException(
        'Extraction impossible. Réessaie avec des photos plus nettes.',
      );
    }

    const payload = this.normalizePayload(parsed);
    if (payload.categories.length === 0) {
      throw new BadRequestException(
        'Aucun plat détecté. Vérifie que le menu est lisible sur les images.',
      );
    }

    const filenames = prepared
      .map((entry) => entry.filename)
      .filter((name): name is string => !!name);

    const saved = await this.extractionRepo.save(
      this.extractionRepo.create({
        businessId,
        status: 'pending_review',
        sourceFilename:
          filenames.length > 0 ? filenames.join(', ') : null,
        sourceMediaType: prepared.map((entry) => entry.mediaType).join(','),
        extractedJson: payload,
        rawModelText: rawText || null,
        publishedAt: null,
      }),
    );

    return this.toDto(saved);
  }

  async findForBusiness(
    businessId: string,
    extractionId: string,
  ): Promise<MenuExtractionDto | null> {
    const extraction = await this.findEntity(businessId, extractionId);
    return extraction ? this.toDto(extraction) : null;
  }

  async updateDraft(
    businessId: string,
    extractionId: string,
    categories: unknown,
  ): Promise<MenuExtractionDto> {
    const extraction = await this.findEntity(businessId, extractionId);
    if (!extraction) {
      throw new NotFoundException('Extraction introuvable');
    }
    if (extraction.status !== 'pending_review') {
      throw new BadRequestException(
        'Seule une extraction en review peut être modifiée',
      );
    }

    const payload = this.normalizePayload({ categories });
    if (payload.categories.length === 0) {
      throw new BadRequestException('Au moins une catégorie avec un plat');
    }

    extraction.extractedJson = payload;
    const saved = await this.extractionRepo.save(extraction);
    return this.toDto(saved);
  }

  async discard(
    businessId: string,
    extractionId: string,
  ): Promise<{ discarded: true }> {
    const extraction = await this.findEntity(businessId, extractionId);
    if (!extraction) {
      throw new NotFoundException('Extraction introuvable');
    }
    if (extraction.status === 'published') {
      throw new BadRequestException('Extraction déjà publiée');
    }

    extraction.status = 'discarded';
    await this.extractionRepo.save(extraction);
    return { discarded: true };
  }

  async publish(
    businessId: string,
    extractionId: string,
    options: { mode?: 'append' | 'replace' } = {},
  ): Promise<{
    published: true;
    created_count: number;
    mode: 'append' | 'replace';
    cleared_count: number;
  }> {
    const mode = options.mode === 'replace' ? 'replace' : 'append';
    const extraction = await this.findEntity(businessId, extractionId);
    if (!extraction) {
      throw new NotFoundException('Extraction introuvable');
    }
    if (extraction.status !== 'pending_review') {
      throw new BadRequestException(
        'Publication refusée : review humaine requise (statut invalide)',
      );
    }

    const payload = this.normalizePayload(extraction.extractedJson);
    if (payload.categories.length === 0) {
      throw new BadRequestException('Rien à publier');
    }

    let clearedCount = 0;
    if (mode === 'replace') {
      clearedCount = await this.menuService.clearAllItems(businessId);
    }

    let createdCount = 0;
    for (const category of payload.categories) {
      for (const item of category.items) {
        await this.menuService.createItem(businessId, {
          category: category.name,
          name: item.name,
          price: item.price,
          description: item.description,
          available: item.available,
          options: this.menuService.normalizeOptions(item.options),
        });
        createdCount += 1;
      }
    }

    extraction.status = 'published';
    extraction.publishedAt = new Date();
    extraction.extractedJson = payload;
    await this.extractionRepo.save(extraction);

    return {
      published: true,
      created_count: createdCount,
      mode,
      cleared_count: clearedCount,
    };
  }

  private async findEntity(
    businessId: string,
    extractionId: string,
  ): Promise<MenuExtraction | null> {
    if (!isUuid(extractionId)) {
      return null;
    }
    return this.extractionRepo.findOneBy({ id: extractionId, businessId });
  }

  private resolveMediaType(
    mimetype: string,
    filename?: string,
  ): AllowedMediaType | null {
    const normalized = (mimetype || '').toLowerCase().trim();
    if (ALLOWED_MEDIA_TYPES.has(normalized as AllowedMediaType)) {
      return normalized as AllowedMediaType;
    }

    const lowerName = (filename || '').toLowerCase();
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lowerName.endsWith('.png')) {
      return 'image/png';
    }
    if (lowerName.endsWith('.webp')) {
      return 'image/webp';
    }
    if (lowerName.endsWith('.gif')) {
      return 'image/gif';
    }
    return null;
  }

  normalizePayload(value: unknown): ExtractedMenuPayload {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('extracted_json invalide');
    }

    const rawCategories = (value as Record<string, unknown>).categories;
    if (!Array.isArray(rawCategories)) {
      throw new BadRequestException('categories doit être un tableau');
    }

    const categories: ExtractedMenuCategory[] = [];
    for (const entry of rawCategories) {
      const category = this.normalizeCategory(entry);
      if (category) {
        categories.push(category);
      }
    }

    return { categories };
  }

  private normalizeCategory(value: unknown): ExtractedMenuCategory | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const name =
      typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return null;
    }

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: ExtractedMenuItem[] = [];
    for (const entry of rawItems) {
      const item = this.normalizeItem(entry);
      if (item) {
        items.push(item);
      }
    }

    if (items.length === 0) {
      return null;
    }

    return { name, items };
  }

  private normalizeItem(value: unknown): ExtractedMenuItem | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return null;
    }

    let description: string | null = null;
    if (typeof raw.description === 'string') {
      description = raw.description.trim() || null;
    } else if (raw.description === null) {
      description = null;
    }

    const available =
      typeof raw.available === 'boolean' ? raw.available : true;

    let options = this.menuService.normalizeOptions(raw.options);
    let price =
      typeof raw.price === 'number' ? raw.price : Number(raw.price);

    const variants = this.readVariants(raw.variants ?? raw.prices);
    if (variants.length >= 2) {
      const optionName =
        typeof raw.variant_label === 'string' && raw.variant_label.trim()
          ? raw.variant_label.trim()
          : this.guessVariantOptionName(variants.map((v) => v.name));
      const converted = this.menuService.variantsToOption(
        variants,
        optionName,
      );
      if (converted) {
        price = converted.basePrice;
        // Remplace une éventuelle option Format déjà présente
        options = [
          converted.option,
          ...options.filter(
            (option) =>
              option.name.toLowerCase() !==
              converted.option.name.toLowerCase(),
          ),
        ];
      }
    }

    if (!Number.isFinite(price) || price < 0) {
      return null;
    }

    return {
      name,
      price,
      description,
      available,
      options,
    };
  }

  private readVariants(
    value: unknown,
  ): Array<{ name: string; price: number }> {
    if (!Array.isArray(value)) {
      return [];
    }

    const variants: Array<{ name: string; price: number }> = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const raw = entry as Record<string, unknown>;
      const name =
        typeof raw.name === 'string'
          ? raw.name.trim()
          : typeof raw.label === 'string'
            ? raw.label.trim()
            : '';
      const price =
        typeof raw.price === 'number' ? raw.price : Number(raw.price);
      if (!name || !Number.isFinite(price) || price < 0) {
        continue;
      }
      variants.push({ name, price });
    }
    return variants;
  }

  private guessVariantOptionName(labels: string[]): string {
    const joined = labels.map((label) => label.toLowerCase()).join('|');
    if (
      joined.includes('mm') ||
      joined.includes('gm') ||
      joined.includes('moyen') ||
      joined.includes('grand')
    ) {
      return 'Taille';
    }
    if (joined.includes('sandwich') || joined.includes('plat')) {
      return 'Format';
    }
    if (joined.includes('perso') || joined.includes('duo')) {
      return 'Format';
    }
    return 'Format';
  }

  private toDto(extraction: MenuExtraction): MenuExtractionDto {
    const payload = this.normalizePayload(extraction.extractedJson);
    return {
      id: extraction.id,
      status: extraction.status,
      source_filename: extraction.sourceFilename,
      source_media_type: extraction.sourceMediaType,
      categories: payload.categories,
      created_at: extraction.createdAt.toISOString(),
      updated_at: extraction.updatedAt.toISOString(),
      published_at: extraction.publishedAt
        ? extraction.publishedAt.toISOString()
        : null,
    };
  }
}
