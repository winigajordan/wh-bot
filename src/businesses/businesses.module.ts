import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessesService } from './businesses.service';
import { Business } from './entities/business.entity';
import { PlatformModule } from './entities/platform-module.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Business, User, PlatformModule])],
  providers: [BusinessesService],
  exports: [TypeOrmModule, BusinessesService],
})
export class BusinessesModule {}
