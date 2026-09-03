import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chiffrement au repos : drop des colonnes en clair (archive de test OK à perdre).
 * Remplace client_phone / content par hash + ciphertext.
 */
export class EncryptConversationFields1787003100000
  implements MigrationInterface
{
  name = 'EncryptConversationFields1787003100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "messages"`);
    await queryRunner.query(`DELETE FROM "conversations"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_conversations_business_phone_active"`,
    );

    await queryRunner.query(
      `ALTER TABLE "conversations" DROP COLUMN IF EXISTS "client_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "client_phone_hash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "client_phone_encrypted" text NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "messages" DROP COLUMN IF EXISTS "content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "content_encrypted" text`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_conversations_business_phone_hash_active"
        ON "conversations" ("business_id", "client_phone_hash")
        WHERE "status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_conversations_business_phone_hash_active"`,
    );

    await queryRunner.query(`DELETE FROM "messages"`);
    await queryRunner.query(`DELETE FROM "conversations"`);

    await queryRunner.query(
      `ALTER TABLE "messages" DROP COLUMN IF EXISTS "content_encrypted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "content" text`,
    );

    await queryRunner.query(
      `ALTER TABLE "conversations" DROP COLUMN IF EXISTS "client_phone_encrypted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP COLUMN IF EXISTS "client_phone_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "client_phone" character varying NOT NULL`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_conversations_business_phone_active"
        ON "conversations" ("business_id", "client_phone")
        WHERE "status" = 'active'
    `);
  }
}
