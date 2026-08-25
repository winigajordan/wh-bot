import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { Business } from '../../businesses/entities/business.entity';
import { User } from '../../businesses/entities/user.entity';

const TEST_USERS = [
  {
    email: 'winiga@test.local',
    password: 'password123',
    businessWhatsappPhoneNumberId: '932272133302608',
  },
  {
    email: 'delices@test.local',
    password: 'password123',
    businessWhatsappPhoneNumberId: '1324766734042842',
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const businessRepo = dataSource.getRepository(Business);

  for (const row of TEST_USERS) {
    const business = await businessRepo.findOneBy({
      whatsappPhoneNumberId: row.businessWhatsappPhoneNumberId,
    });

    if (!business) {
      console.warn(
        `Business introuvable pour phone_number_id=${row.businessWhatsappPhoneNumberId} — lance npm run seed d’abord`,
      );
      continue;
    }

    let user = await userRepo.findOneBy({ email: row.email });
    if (!user) {
      const passwordHash = await bcrypt.hash(row.password, 10);
      user = await userRepo.save(
        userRepo.create({
          email: row.email,
          passwordHash,
        }),
      );
      console.log(`User créé : ${user.email} (${user.id})`);
    } else {
      console.log(`User déjà présent : ${user.email} (${user.id})`);
    }

    if (business.userId === user.id) {
      console.log(`Déjà lié : ${business.name} → ${user.email}`);
      continue;
    }

    if (business.userId && business.userId !== user.id) {
      console.warn(
        `Business ${business.name} déjà lié à un autre user (${business.userId}) — skip`,
      );
      continue;
    }

    business.userId = user.id;
    await businessRepo.save(business);
    console.log(`Lié : ${business.name} → ${user.email}`);
  }

  console.log('\nComptes test :');
  for (const row of TEST_USERS) {
    console.log(`  ${row.email} / ${row.password}`);
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
