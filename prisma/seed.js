const { PrismaClient } = require('../main/generated/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding local SQLite database with coffee menu...');

  // 1. Clean Database
  await prisma.recipeIngredient.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.orderItemModifier.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.employeeShift.deleteMany();
  await prisma.modifier.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.localSyncOutbox.deleteMany();

  // 2. Create Inventory Stock
  const stockBeans = await prisma.inventoryStock.create({
    data: { ingredientName: 'Coffee Beans (g)', quantity: 5000.0, minThreshold: 1000.0 }
  });
  const stockWholeMilk = await prisma.inventoryStock.create({
    data: { ingredientName: 'Whole Milk (ml)', quantity: 15000.0, minThreshold: 3000.0 }
  });
  const stockOatMilk = await prisma.inventoryStock.create({
    data: { ingredientName: 'Oat Milk (ml)', quantity: 4000.0, minThreshold: 1000.0 }
  });
  const stockVanillaSyrup = await prisma.inventoryStock.create({
    data: { ingredientName: 'Vanilla Syrup (ml)', quantity: 2000.0, minThreshold: 500.0 }
  });
  const stockCups = await prisma.inventoryStock.create({
    data: { ingredientName: 'Hot Cups (Qty)', quantity: 200.0, minThreshold: 30.0 }
  });

  // 3. Create Modifier Groups
  const groupMilk = await prisma.modifierGroup.create({
    data: { name: 'Milk Options', minSelected: 0, maxSelected: 1 }
  });
  const groupSyrup = await prisma.modifierGroup.create({
    data: { name: 'Syrup Options', minSelected: 0, maxSelected: 2 }
  });
  const groupAddons = await prisma.modifierGroup.create({
    data: { name: 'Add-ons', minSelected: 0, maxSelected: 3 }
  });

  // Create Modifiers
  const modWholeMilk = await prisma.modifier.create({
    data: { name: 'Whole Milk', price: 0.00, groupId: groupMilk.id }
  });
  const modOatMilk = await prisma.modifier.create({
    data: { name: 'Oat Milk', price: 0.80, groupId: groupMilk.id }
  });
  const modVanilla = await prisma.modifier.create({
    data: { name: 'Vanilla Syrup', price: 0.50, groupId: groupSyrup.id }
  });
  const modShot = await prisma.modifier.create({
    data: { name: 'Extra Espresso Shot', price: 1.00, groupId: groupAddons.id }
  });

  // Tie Modifiers to Inventory Recipes
  await prisma.recipeIngredient.create({
    data: {
      modifierId: modOatMilk.id,
      inventoryStockId: stockOatMilk.id,
      amountRequired: 200.0
    }
  });
  await prisma.recipeIngredient.create({
    data: {
      modifierId: modWholeMilk.id,
      inventoryStockId: stockWholeMilk.id,
      amountRequired: 200.0
    }
  });
  await prisma.recipeIngredient.create({
    data: {
      modifierId: modShot.id,
      inventoryStockId: stockBeans.id,
      amountRequired: 9.0
    }
  });

  // 4. Create Products
  // Product A: Espresso
  const prodEspresso = await prisma.product.create({
    data: { name: 'Espresso', description: 'Intense and aromatic double shot of espresso.', category: 'Coffee', imageUrl: 'espresso' }
  });
  const varEspSingle = await prisma.productVariant.create({
    data: { name: 'Single Shot', price: 2.50, sku: 'COF-ESP-SGL', productId: prodEspresso.id }
  });
  const varEspDouble = await prisma.productVariant.create({
    data: { name: 'Double Shot', price: 3.20, sku: 'COF-ESP-DBL', productId: prodEspresso.id }
  });

  // Espresso Recipes
  await prisma.recipeIngredient.create({
    data: { productVariantId: varEspSingle.id, inventoryStockId: stockBeans.id, amountRequired: 9.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varEspSingle.id, inventoryStockId: stockCups.id, amountRequired: 1.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varEspDouble.id, inventoryStockId: stockBeans.id, amountRequired: 18.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varEspDouble.id, inventoryStockId: stockCups.id, amountRequired: 1.0 }
  });

  // Product B: Cappuccino
  const prodCappuccino = await prisma.product.create({
    data: { name: 'Cappuccino', description: 'Double espresso with steamed milk and thick layer of foam.', category: 'Coffee', imageUrl: 'cappuccino' }
  });
  const varCapReg = await prisma.productVariant.create({
    data: { name: 'Regular (12oz)', price: 4.50, sku: 'COF-CAP-REG', productId: prodCappuccino.id }
  });
  const varCapLrg = await prisma.productVariant.create({
    data: { name: 'Large (16oz)', price: 5.20, sku: 'COF-CAP-LRG', productId: prodCappuccino.id }
  });

  // Cappuccino Recipes
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapReg.id, inventoryStockId: stockBeans.id, amountRequired: 18.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapReg.id, inventoryStockId: stockWholeMilk.id, amountRequired: 180.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapReg.id, inventoryStockId: stockCups.id, amountRequired: 1.0 }
  });

  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapLrg.id, inventoryStockId: stockBeans.id, amountRequired: 18.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapLrg.id, inventoryStockId: stockWholeMilk.id, amountRequired: 240.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCapLrg.id, inventoryStockId: stockCups.id, amountRequired: 1.0 }
  });

  // Product C: Croissant (Food, no modifiers needed)
  const prodCroissant = await prisma.product.create({
    data: { name: 'Butter Croissant', description: 'Flaky and buttery French pastry.', category: 'Pastry', imageUrl: 'croissant' }
  });
  const varCroissant = await prisma.productVariant.create({
    data: { name: 'Standard', price: 3.50, sku: 'FOD-CRO-STD', productId: prodCroissant.id }
  });
  // Croissant Recipe
  const stockPastries = await prisma.inventoryStock.create({
    data: { ingredientName: 'Butter Croissant (Qty)', quantity: 30.0, minThreshold: 5.0 }
  });
  await prisma.recipeIngredient.create({
    data: { productVariantId: varCroissant.id, inventoryStockId: stockPastries.id, amountRequired: 1.0 }
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
