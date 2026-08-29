import dataSource from '../data-source';
import { Business } from '../../businesses/entities/business.entity';
import { PlatformModule } from '../../businesses/entities/platform-module.entity';

const TEST_BUSINESSES = [
  {
    name: 'Winiga Jordan',
    address: 'Almadies, Dakar',
    contactPhone: '+221757463112',
    whatsappPhoneNumberId: '932272133302608',
    whatsappWabaId: '1556071775682093',
    status: 'active' as const,
  },
  {
    name: 'Les délices de Jordan',
    address: 'Plateau, Dakar',
    contactPhone: '+221787149128',
    whatsappPhoneNumberId: '1324766734042842',
    whatsappWabaId: '2041223889836669',
    status: 'active' as const,
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  const moduleRepo = dataSource.getRepository(PlatformModule);
  const businessRepo = dataSource.getRepository(Business);

  const restoModule = await moduleRepo.findOneBy({
    key: 'restaurant_ordering',
  });
  if (!restoModule) {
    throw new Error(
      "Module restaurant_ordering introuvable. Lance d'abord npm run migration:run.",
    );
  }

  for (const row of TEST_BUSINESSES) {
    const existing = await businessRepo.findOneBy({
      whatsappPhoneNumberId: row.whatsappPhoneNumberId,
    });

    if (existing) {
      console.log(`Déjà présent : ${row.name} (${existing.id})`);
      continue;
    }

    const business = await businessRepo.save(
      businessRepo.create({
        ...row,
        moduleId: restoModule.id,
        userId: null,
        timezone: 'Africa/Dakar',
        onboardingState: {},
      }),
    );

    console.log(
      `Seedé : ${business.name}  id=${business.id}  phone_number_id=${business.whatsappPhoneNumberId}`,
    );
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
