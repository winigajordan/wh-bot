import dataSource from '../data-source';
import { Business } from '../../businesses/entities/business.entity';
import { DeliveryZone } from '../../restaurant-ordering/delivery-zones/entities/delivery-zone.entity';

const ZONES_BY_BUSINESS_NAME: Record<string, string[]> = {
  'Winiga Jordan': ['Almadies', 'Ngor', 'Ouakam', 'Yoff'],
  'Les délices de Jordan': ['Plateau', 'Médina', 'Fass', 'Point E'],
};

async function seed(): Promise<void> {
  await dataSource.initialize();

  const businessRepo = dataSource.getRepository(Business);
  const zoneRepo = dataSource.getRepository(DeliveryZone);

  for (const [businessName, zones] of Object.entries(ZONES_BY_BUSINESS_NAME)) {
    const business = await businessRepo.findOneBy({ name: businessName });
    if (!business) {
      console.warn(`Business introuvable : ${businessName} — skip zones`);
      continue;
    }

    for (const zoneName of zones) {
      const existing = await zoneRepo.findOneBy({
        businessId: business.id,
        zoneName,
      });

      if (existing) {
        console.log(`Zone déjà présente : ${businessName} / ${zoneName}`);
        continue;
      }

      await zoneRepo.save(
        zoneRepo.create({
          businessId: business.id,
          zoneName,
        }),
      );

      console.log(`Zone seedée : ${businessName} / ${zoneName}`);
    }
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
