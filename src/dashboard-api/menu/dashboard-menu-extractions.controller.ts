import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MenuExtractionService } from '../../restaurant-ordering/menu/menu-extraction.service';

type UploadedMenuFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Controller('dashboard/menu/extractions')
@UseGuards(JwtAuthGuard)
export class DashboardMenuExtractionsController {
  constructor(private readonly extractions: MenuExtractionService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files?: UploadedMenuFile[],
  ) {
    if (!files?.length) {
      throw new BadRequestException(
        'Au moins une image requise (champ files, max 5)',
      );
    }
    return this.extractions.createFromUpload(user.businessId, files);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const extraction = await this.extractions.findForBusiness(
      user.businessId,
      id,
    );
    if (!extraction) {
      throw new NotFoundException('Extraction introuvable');
    }
    return extraction;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body JSON requis');
    }
    const categories = (body as Record<string, unknown>).categories;
    return this.extractions.updateDraft(user.businessId, id, categories);
  }

  @Post(':id/publish')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const mode =
      body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>).mode === 'replace'
        ? 'replace'
        : 'append';
    return this.extractions.publish(user.businessId, id, { mode });
  }

  @Delete(':id')
  async discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.extractions.discard(user.businessId, id);
  }
}
