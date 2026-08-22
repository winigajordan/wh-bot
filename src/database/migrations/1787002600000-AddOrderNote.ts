import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderNote1787002600000 implements MigrationInterface {
  name = 'AddOrderNote1787002600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "note" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "note"`);
  }
}
