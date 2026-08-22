import dataSource from '../data-source';
import { Business } from '../../businesses/entities/business.entity';
import { MenuItem } from '../../restaurant-ordering/menu/entities/menu-item.entity';

type SeedMenuItem = {
  category: string;
  name: string;
  price: number;
  description?: string;
  available?: boolean;
};

const MENU_BY_BUSINESS_NAME: Record<string, SeedMenuItem[]> = {
  'Winiga Jordan': [
    {
      category: 'Plats',
      name: 'Thieb poulet',
      price: 3500,
      description: 'Riz au poisson, légumes, poulet grillé',
    },
    {
      category: 'Plats',
      name: 'Yassa poulet',
      price: 3000,
      description: 'Poulet mariné aux oignons',
    },
    {
      category: 'Grillades',
      name: 'Brochettes de bœuf',
      price: 2500,
      description: '3 brochettes, sauce oignon',
    },
    {
      category: 'Boissons',
      name: 'Bissap',
      price: 500,
      description: 'Jus d’hibiscus maison',
    },
    {
      category: 'Boissons',
      name: 'Ginger',
      price: 500,
      description: 'Jus de gingembre',
    },
  ],
  'Les délices de Jordan': [
    {
      category: 'Plats',
      name: 'Mafé bœuf',
      price: 3200,
      description: 'Sauce arachide, viande de bœuf',
    },
    {
      category: 'Plats',
      name: 'Thieb yapp',
      price: 3800,
      description: 'Riz au poisson avec viande',
    },
    {
      category: 'Grillades',
      name: 'Dibi poulet',
      price: 4000,
      description: 'Poulet grillé, oignons frits',
    },
    {
      category: 'Desserts',
      name: 'Thiakry',
      price: 1500,
      description: 'Couscous sucré au lait caillé',
      available: false,
    },
    {
      category: 'Boissons',
      name: 'Bouye',
      price: 600,
      description: 'Jus de pain de singe',
    },
  ],
};

async function seed(): Promise<void> {
  await dataSource.initialize();

  const businessRepo = dataSource.getRepository(Business);
  const menuRepo = dataSource.getRepository(MenuItem);

  for (const [businessName, items] of Object.entries(MENU_BY_BUSINESS_NAME)) {
    const business = await businessRepo.findOneBy({ name: businessName });
    if (!business) {
      console.warn(`Business introuvable : ${businessName} — skip menu`);
      continue;
    }

    for (const item of items) {
      const existing = await menuRepo.findOneBy({
        businessId: business.id,
        name: item.name,
      });

      if (existing) {
        console.log(`Menu déjà présent : ${businessName} / ${item.name}`);
        continue;
      }

      await menuRepo.save(
        menuRepo.create({
          businessId: business.id,
          category: item.category,
          name: item.name,
          price: item.price.toFixed(2),
          description: item.description ?? null,
          available: item.available ?? true,
          options: [],
        }),
      );

      console.log(`Menu seedé : ${businessName} / ${item.name}`);
    }
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
