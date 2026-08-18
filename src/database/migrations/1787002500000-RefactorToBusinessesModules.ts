import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorToBusinessesModules1787002500000 implements MigrationInterface {
  name = 'RefactorToBusinessesModules1787002500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_users_email" UNIQUE ("email"), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "modules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_modules_key" UNIQUE ("key"), CONSTRAINT "PK_modules" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "modules" ("key", "name", "description") VALUES ('restaurant_ordering', 'Commande Restaurant', 'Prise de commande automatisée pour restaurants via WhatsApp')`,
    );

    await queryRunner.query(
      `ALTER TABLE "delivery_zones" DROP CONSTRAINT "FK_9526f8e41e197f6d44b0b736ac4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" DROP CONSTRAINT "FK_8d1ee4780bf64ae94cbf3e53705"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_3b435f141b3ee03881e7c4e7184"`,
    );

    await queryRunner.query(`ALTER TABLE "restaurants" RENAME TO "businesses"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "opening_hours"`);
    await queryRunner.query(`ALTER TABLE "businesses" ADD "user_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD CONSTRAINT "UQ_businesses_user_id" UNIQUE ("user_id")`,
    );
    await queryRunner.query(`ALTER TABLE "businesses" ADD "module_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "timezone" character varying NOT NULL DEFAULT 'Africa/Dakar'`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD "onboarding_state" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ALTER COLUMN "status" SET DEFAULT 'onboarding'`,
    );
    await queryRunner.query(
      `UPDATE "businesses" SET "module_id" = (SELECT "id" FROM "modules" WHERE "key" = 'restaurant_ordering') WHERE "module_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ALTER COLUMN "module_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD CONSTRAINT "FK_businesses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD CONSTRAINT "FK_businesses_module_id" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "delivery_zones" RENAME COLUMN "restaurant_id" TO "business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "restaurant_id" TO "business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" RENAME COLUMN "restaurant_id" TO "business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" RENAME COLUMN "restaurant_id" TO "business_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "delivery_zones" ADD CONSTRAINT "FK_delivery_zones_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD CONSTRAINT "FK_menu_items_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_conversations_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_conversations_business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" DROP CONSTRAINT "FK_menu_items_business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_business_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_zones" DROP CONSTRAINT "FK_delivery_zones_business_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "conversations" RENAME COLUMN "business_id" TO "restaurant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" RENAME COLUMN "business_id" TO "restaurant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "business_id" TO "restaurant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_zones" RENAME COLUMN "business_id" TO "restaurant_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "businesses" DROP CONSTRAINT "FK_businesses_module_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP CONSTRAINT "FK_businesses_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP CONSTRAINT "UQ_businesses_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "onboarding_state"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "timezone"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "module_id"`);
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "businesses" ADD "opening_hours" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "businesses" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(`ALTER TABLE "businesses" RENAME TO "restaurants"`);

    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_3b435f141b3ee03881e7c4e7184" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD CONSTRAINT "FK_8d1ee4780bf64ae94cbf3e53705" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_zones" ADD CONSTRAINT "FK_9526f8e41e197f6d44b0b736ac4" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`DROP TABLE "modules"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
