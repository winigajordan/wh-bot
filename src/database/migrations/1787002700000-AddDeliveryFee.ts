import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryFee1787002700000 implements MigrationInterface {
  name = 'AddDeliveryFee1787002700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery_zones" ADD "delivery_fee" numeric NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "delivery_fee" numeric NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_fee"`);
    await queryRunner.query(
      `ALTER TABLE "delivery_zones" DROP COLUMN "delivery_fee"`,
    );
  }
}
