import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeModule } from '../../claude/claude.module';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuExtraction } from './entities/menu-extraction.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MenuExtractionService } from './menu-extraction.service';
import { MenuService } from './menu.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuItem, MenuCategory, MenuExtraction]),
    ClaudeModule,
  ],
  providers: [MenuService, MenuExtractionService],
  exports: [TypeOrmModule, MenuService, MenuExtractionService],
})
export class MenuModule {}
