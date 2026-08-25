import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMenuExtractions1787002900000 implements MigrationInterface {
  name = 'AddMenuExtractions1787002900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "menu_extractions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending_review',
        "source_filename" character varying,
        "source_media_type" character varying NOT NULL,
        "extracted_json" jsonb NOT NULL,
        "raw_model_text" text,
        "published_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_menu_extractions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_menu_extractions_business"
          FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_menu_extractions_business_status"
        ON "menu_extractions" ("business_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_menu_extractions_business_status"`,
    );
    await queryRunner.query(`DROP TABLE "menu_extractions"`);
  }
}
