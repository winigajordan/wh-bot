import { MigrationInterface, QueryRunner } from "typeorm";

export class Schema1787001345500 implements MigrationInterface {
    name = 'Schema1787001345500'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "restaurants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" text, "contact_phone" character varying, "whatsapp_phone_number_id" character varying NOT NULL, "whatsapp_waba_id" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "opening_hours" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_dbba31461645d1b10f05e43be87" UNIQUE ("whatsapp_phone_number_id"), CONSTRAINT "PK_e2133a72eb1cc8f588f7b503e68" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "delivery_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "zone_name" character varying NOT NULL, CONSTRAINT "PK_88bc4c12be62436a61930cf34a9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "client_phone" character varying NOT NULL, "order_number" character varying NOT NULL, "items" jsonb NOT NULL, "delivery_mode" character varying NOT NULL, "delivery_address" text, "delivery_zone_id" uuid, "total" numeric NOT NULL, "status" character varying NOT NULL DEFAULT 'received', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_75eba1c6b1a66b09f2a97e6927b" UNIQUE ("order_number"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "status" character varying NOT NULL, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "menu_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "category" character varying NOT NULL, "name" character varying NOT NULL, "price" numeric NOT NULL, "description" text, "available" boolean NOT NULL DEFAULT true, "options" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_57e6188f929e5dc6919168620c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "client_phone" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "last_message_at" TIMESTAMP NOT NULL DEFAULT now(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "role" character varying NOT NULL, "content" text, "tool_calls" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "delivery_zones" ADD CONSTRAINT "FK_9526f8e41e197f6d44b0b736ac4" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_cd57b908ee36ea2d8601f660d8f" FOREIGN KEY ("delivery_zone_id") REFERENCES "delivery_zones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "menu_items" ADD CONSTRAINT "FK_8d1ee4780bf64ae94cbf3e53705" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "FK_3b435f141b3ee03881e7c4e7184" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_3b435f141b3ee03881e7c4e7184"`);
        await queryRunner.query(`ALTER TABLE "menu_items" DROP CONSTRAINT "FK_8d1ee4780bf64ae94cbf3e53705"`);
        await queryRunner.query(`ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_cd57b908ee36ea2d8601f660d8f"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6"`);
        await queryRunner.query(`ALTER TABLE "delivery_zones" DROP CONSTRAINT "FK_9526f8e41e197f6d44b0b736ac4"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP TABLE "menu_items"`);
        await queryRunner.query(`DROP TABLE "order_status_history"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TABLE "delivery_zones"`);
        await queryRunner.query(`DROP TABLE "restaurants"`);
    }

}
