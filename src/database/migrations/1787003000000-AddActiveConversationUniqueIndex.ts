import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActiveConversationUniqueIndex1787003000000
  implements MigrationInterface
{
  name = 'AddActiveConversationUniqueIndex1787003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_conversations_business_phone_active"
        ON "conversations" ("business_id", "client_phone")
        WHERE "status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_conversations_business_phone_active"`,
    );
  }
}
