import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  let service: MenuService;
  const getMany = jest.fn();
  const findOneBy = jest.fn();
  const categoryGetOne = jest.fn();
  const categoryFind = jest.fn();
  const categoryCreate = jest.fn((value) => value);
  const categorySave = jest.fn(async (value) => ({
    ...value,
    id: value.id ?? 'cat-1',
    createdAt: value.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: value.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  }));

  beforeEach(async () => {
    getMany.mockReset();
    findOneBy.mockReset();
    categoryGetOne.mockReset();
    categoryFind.mockReset();
    categoryCreate.mockClear();
    categorySave.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        {
          provide: getRepositoryToken(MenuItem),
          useValue: {
            findOneBy,
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value),
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              getMany,
            }),
          },
        },
        {
          provide: getRepositoryToken(MenuCategory),
          useValue: {
            find: categoryFind,
            create: categoryCreate,
            save: categorySave,
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: categoryGetOne,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(MenuService);
  });

  it('groupe les items par catégorie', async () => {
    getMany.mockResolvedValue([
      {
        id: '1',
        category: 'Plats',
        name: 'Thieb',
        price: '3500.00',
        description: null,
        available: true,
        options: [],
      },
      {
        id: '2',
        category: 'Boissons',
        name: 'Bissap',
        price: '500.00',
        description: 'Maison',
        available: true,
        options: [],
      },
      {
        id: '3',
        category: 'Plats',
        name: 'Yassa',
        price: '3000.00',
        description: null,
        available: false,
        options: [],
      },
    ]);

    await expect(service.getMenu('biz-1')).resolves.toEqual({
      categories: [
        {
          name: 'Plats',
          items: [
            expect.objectContaining({
              id: '1',
              name: 'Thieb',
              price: 3500,
              price_label: '3 500 F',
            }),
            expect.objectContaining({ id: '3', name: 'Yassa', available: false }),
          ],
        },
        {
          name: 'Boissons',
          items: [
            expect.objectContaining({
              id: '2',
              name: 'Bissap',
              price: 500,
              price_label: '500 F',
            }),
          ],
        },
      ],
    });
  });

  it('formatItemPriceLabel inclut les variantes', () => {
    expect(
      service.formatItemPriceLabel(2500, [
        {
          name: 'Format',
          required: true,
          price: 0,
          choices: [
            { name: 'Sandwich', price: 0 },
            { name: 'Plat', price: 5000 },
          ],
        },
      ]),
    ).toBe('Sandwich 2 500 F · Plat 7 500 F');
  });

  it('findById ignore les identifiants non-UUID', async () => {
    await expect(
      service.findById('biz-1', 'thieb-yapp-id'),
    ).resolves.toBeNull();
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it('variantsToOption convertit MM/GM en base + suppléments', () => {
    const converted = service.variantsToOption(
      [
        { name: 'MM', price: 5500 },
        { name: 'GM', price: 6000 },
      ],
      'Taille',
    );

    expect(converted).toEqual({
      basePrice: 5500,
      option: {
        name: 'Taille',
        required: true,
        price: 0,
        choices: [
          { name: 'MM', price: 0 },
          { name: 'GM', price: 500 },
        ],
      },
    });
  });

  it('resolveSelectedOptions utilise le prix de la variante choisie', () => {
    const resolved = service.resolveSelectedOptions(
      [
        {
          name: 'Taille',
          required: true,
          price: 0,
          choices: [
            { name: 'MM', price: 0 },
            { name: 'GM', price: 500 },
          ],
        },
      ],
      ['GM'],
    );

    expect(resolved).toEqual({
      success: true,
      options: [{ name: 'Taille', price: 500, choice: 'GM' }],
      extra: 500,
    });
  });

  it('normalizeOptions accepte choices string legacy', () => {
    expect(
      service.normalizeOptions([
        { name: 'Boisson', required: true, choices: ['Fanta', 'Coca'] },
      ]),
    ).toEqual([
      {
        name: 'Boisson',
        required: true,
        price: 0,
        choices: [
          { name: 'Fanta', price: 0 },
          { name: 'Coca', price: 0 },
        ],
      },
    ]);
  });
});
