import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';

const { database } = configuration();

export default new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.user,
  password: database.pass || undefined,
  database: database.name,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
