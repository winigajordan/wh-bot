import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMenuCategories1787002800000 implements MigrationInterface {
  name = 'AddMenuCategories1787002800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "menu_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_menu_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_menu_categories_business_name" UNIQUE ("business_id", "name"),
        CONSTRAINT "FK_menu_categories_business"
          FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "menu_categories" ("business_id", "name")
      SELECT DISTINCT "business_id", "category"
      FROM "menu_items"
      WHERE "category" IS NOT NULL AND TRIM("category") <> ''
      ON CONFLICT ("business_id", "name") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "menu_categories"`);
  }
}
