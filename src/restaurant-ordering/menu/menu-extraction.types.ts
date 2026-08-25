import type { MenuOption } from './menu.types';

export type ExtractedMenuItem = {
  name: string;
  price: number;
  description: string | null;
  available: boolean;
  options: MenuOption[];
};

export type ExtractedMenuCategory = {
  name: string;
  items: ExtractedMenuItem[];
};

export type ExtractedMenuPayload = {
  categories: ExtractedMenuCategory[];
};

export type MenuExtractionDto = {
  id: string;
  status: 'pending_review' | 'published' | 'discarded';
  source_filename: string | null;
  source_media_type: string;
  categories: ExtractedMenuCategory[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
