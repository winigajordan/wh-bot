import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
      const { options } = this.dataSource;
      const target =
        options.type === 'postgres'
          ? `${options.host}:${options.port}/${options.database}`
          : options.type;
      this.logger.log(`Connexion PostgreSQL OK (${target})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Connexion PostgreSQL échouée au boot : ${message}`);
      throw error;
    }
  }
}
