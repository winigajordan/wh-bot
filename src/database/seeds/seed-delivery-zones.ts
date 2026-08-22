import dataSource from '../data-source';
import { Business } from '../../businesses/entities/business.entity';
import { DeliveryZone } from '../../restaurant-ordering/delivery-zones/entities/delivery-zone.entity';

type SeedZone = {
  name: string;
  deliveryFee: number;
};

const ZONES_BY_BUSINESS_NAME: Record<string, SeedZone[]> = {
  'Winiga Jordan': [
    { name: 'Almadies', deliveryFee: 1500 },
    { name: 'Ngor', deliveryFee: 2000 },
    { name: 'Ouakam', deliveryFee: 2000 },
    { name: 'Yoff', deliveryFee: 2500 },
  ],
  'Les délices de Jordan': [
    { name: 'Plateau', deliveryFee: 1000 },
    { name: 'Médina', deliveryFee: 1500 },
    { name: 'Fass', deliveryFee: 1500 },
    { name: 'Point E', deliveryFee: 2000 },
  ],
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

    for (const zone of zones) {
      const existing = await zoneRepo.findOneBy({
        businessId: business.id,
        zoneName: zone.name,
      });

      if (existing) {
        if (Number(existing.deliveryFee) !== zone.deliveryFee) {
          existing.deliveryFee = zone.deliveryFee.toFixed(2);
          await zoneRepo.save(existing);
          console.log(
            `Frais mis à jour : ${businessName} / ${zone.name} → ${zone.deliveryFee}`,
          );
        } else {
          console.log(`Zone déjà présente : ${businessName} / ${zone.name}`);
        }
        continue;
      }

      await zoneRepo.save(
        zoneRepo.create({
          businessId: business.id,
          zoneName: zone.name,
          deliveryFee: zone.deliveryFee.toFixed(2),
        }),
      );

      console.log(
        `Zone seedée : ${businessName} / ${zone.name} (${zone.deliveryFee} FCFA)`,
      );
    }
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
