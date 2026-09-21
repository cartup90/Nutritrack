/**
 * Base local de alimentos y platos.
 *
 * Objetivo: resolver las recomendaciones habituales SIN llamar a la IA, que es
 * donde se iban los tokens. El modelo solo se usa cuando el usuario pide ideas
 * nuevas explícitamente.
 *
 * Criterios de los datos:
 *   · Alimentos accesibles y de preparación simple, en español.
 *   · Macros aproximados por ración típica (valores redondeados).
 *   · `mealType` indica en qué comida encaja; `any` vale para cualquiera.
 *
 * Etiquetas disponibles (las usa el motor de sugerencias):
 *   alto_proteina  · mucha proteína por caloría
 *   pocas_calorias · ligero
 *   denso          · muchas calorías, útil cuando queda margen amplio
 *   bajo_carbos    · pocos hidratos
 *   verduras       · rico en vegetales
 *   rapido         · sin cocinar o en menos de 5 minutos
 *   vegetariano    · sin carne ni pescado
 *   vegano         · sin ningún producto de origen animal
 */

export const FOODS = [
  // -------------------------------------------------------------------------
  // Desayunos
  // -------------------------------------------------------------------------
  {
    id: 'avena-platano',
    main: 'cereal',
    name: 'Avena con leche y plátano',
    mealType: 'breakfast',
    calories: 350, protein: 12, carbs: 60, fats: 7,
    ingredients: ['Avena', 'Leche', 'Plátano'],
    tags: ['vegetariano', 'rapido'],
  },
  {
    id: 'tostadas-huevo',
    main: 'huevo',
    name: 'Tostadas con huevo revuelto',
    mealType: 'breakfast',
    calories: 320, protein: 18, carbs: 28, fats: 15,
    ingredients: ['Pan integral', 'Huevos'],
    tags: ['alto_proteina', 'rapido', 'vegetariano'],
  },
  {
    id: 'yogur-avena-frutos',
    main: 'lacteo',
    name: 'Yogur griego con avena y frutos rojos',
    mealType: 'breakfast',
    calories: 300, protein: 22, carbs: 35, fats: 7,
    ingredients: ['Yogur griego natural', 'Avena', 'Frutos rojos'],
    tags: ['alto_proteina', 'rapido', 'vegetariano'],
  },
  {
    id: 'tostada-aguacate-huevo',
    main: 'huevo',
    name: 'Tostada de aguacate con huevo',
    mealType: 'breakfast',
    calories: 330, protein: 14, carbs: 28, fats: 19,
    ingredients: ['Pan integral', 'Aguacate', 'Huevo'],
    tags: ['vegetariano', 'rapido'],
  },
  {
    id: 'revuelto-claras',
    main: 'huevo',
    name: 'Revuelto de claras con espinacas',
    mealType: 'breakfast',
    calories: 180, protein: 24, carbs: 6, fats: 6,
    ingredients: ['Claras de huevo', 'Espinacas'],
    tags: ['alto_proteina', 'pocas_calorias', 'bajo_carbos', 'verduras', 'rapido'],
  },
  {
    id: 'requeson-miel',
    main: 'lacteo',
    name: 'Requesón con miel y nueces',
    mealType: 'breakfast',
    calories: 280, protein: 20, carbs: 18, fats: 14,
    ingredients: ['Requesón', 'Miel', 'Nueces'],
    tags: ['alto_proteina', 'rapido', 'vegetariano'],
  },

  // -------------------------------------------------------------------------
  // Comidas y cenas
  // -------------------------------------------------------------------------
  {
    id: 'pollo-arroz-verduras',
    main: 'pollo',
    name: 'Pechuga de pollo con arroz y verduras',
    mealType: 'lunch',
    calories: 620, protein: 48, carbs: 65, fats: 14,
    ingredients: ['Pechuga de pollo', 'Arroz', 'Verduras'],
    tags: ['alto_proteina', 'verduras'],
  },
  {
    id: 'salmon-batata',
    main: 'pescado',
    name: 'Salmón al horno con batata',
    mealType: 'dinner',
    calories: 580, protein: 40, carbs: 45, fats: 25,
    ingredients: ['Salmón', 'Batata', 'Espárragos'],
    tags: ['alto_proteina', 'verduras'],
  },
  {
    id: 'lentejas-verduras',
    main: 'legumbre',
    name: 'Lentejas guisadas con verduras',
    mealType: 'lunch',
    calories: 450, protein: 24, carbs: 60, fats: 10,
    ingredients: ['Lentejas', 'Zanahoria', 'Cebolla', 'Pimiento'],
    tags: ['vegetariano', 'vegano', 'verduras'],
  },
  {
    id: 'bowl-quinoa-pollo',
    main: 'pollo',
    name: 'Bowl de quinoa con pollo y aguacate',
    mealType: 'lunch',
    calories: 650, protein: 45, carbs: 60, fats: 24,
    ingredients: ['Quinoa', 'Pollo', 'Aguacate', 'Tomate'],
    tags: ['alto_proteina', 'verduras'],
  },
  {
    id: 'merluza-patata',
    main: 'pescado',
    name: 'Merluza a la plancha con patata',
    mealType: 'dinner',
    calories: 480, protein: 42, carbs: 45, fats: 12,
    ingredients: ['Merluza', 'Patata', 'Perejil'],
    tags: ['alto_proteina', 'pocas_calorias'],
  },
  {
    id: 'tortilla-patatas',
    main: 'huevo',
    name: 'Tortilla de patatas con ensalada',
    mealType: 'dinner',
    calories: 500, protein: 20, carbs: 40, fats: 28,
    ingredients: ['Huevos', 'Patata', 'Cebolla', 'Lechuga'],
    tags: ['vegetariano', 'verduras'],
  },
  {
    id: 'ensalada-garbanzos-atun',
    main: 'pescado',
    name: 'Ensalada de garbanzos y atún',
    mealType: 'lunch',
    calories: 420, protein: 30, carbs: 40, fats: 14,
    ingredients: ['Garbanzos', 'Atún', 'Tomate', 'Cebolla'],
    tags: ['alto_proteina', 'verduras', 'rapido'],
  },
  {
    id: 'carne-pure-calabaza',
    main: 'carne',
    name: 'Carne magra con puré de calabaza',
    mealType: 'dinner',
    calories: 520, protein: 42, carbs: 35, fats: 22,
    ingredients: ['Carne magra de ternera', 'Calabaza'],
    tags: ['alto_proteina', 'bajo_carbos', 'verduras'],
  },
  {
    id: 'pasta-pollo-tomate',
    main: 'pollo',
    name: 'Pasta integral con pollo y tomate',
    mealType: 'lunch',
    calories: 600, protein: 40, carbs: 75, fats: 14,
    ingredients: ['Pasta integral', 'Pollo', 'Tomate'],
    tags: ['alto_proteina'],
  },
  {
    id: 'revuelto-setas',
    main: 'huevo',
    name: 'Revuelto de setas y huevos con pan',
    mealType: 'dinner',
    calories: 380, protein: 22, carbs: 25, fats: 22,
    ingredients: ['Huevos', 'Setas', 'Pan integral'],
    tags: ['vegetariano', 'rapido'],
  },
  {
    id: 'wrap-pollo',
    main: 'pollo',
    name: 'Wrap de pollo con verduras',
    mealType: 'lunch',
    calories: 450, protein: 32, carbs: 45, fats: 15,
    ingredients: ['Tortilla de trigo', 'Pollo', 'Lechuga', 'Tomate'],
    tags: ['alto_proteina', 'verduras', 'rapido'],
  },
  {
    id: 'sopa-verduras-pollo',
    main: 'pollo',
    name: 'Sopa de verduras con pollo',
    mealType: 'dinner',
    calories: 280, protein: 25, carbs: 22, fats: 8,
    ingredients: ['Pollo', 'Zanahoria', 'Apio', 'Cebolla'],
    tags: ['alto_proteina', 'pocas_calorias', 'verduras'],
  },
  {
    id: 'pescado-ensalada',
    main: 'pescado',
    name: 'Pescado blanco con ensalada',
    mealType: 'dinner',
    calories: 320, protein: 38, carbs: 12, fats: 12,
    ingredients: ['Pescado blanco', 'Lechuga', 'Tomate'],
    tags: ['alto_proteina', 'pocas_calorias', 'bajo_carbos', 'verduras'],
  },
  {
    id: 'tofu-verduras-arroz',
    main: 'tofu',
    name: 'Tofu salteado con verduras y arroz',
    mealType: 'lunch',
    calories: 480, protein: 24, carbs: 55, fats: 18,
    ingredients: ['Tofu', 'Arroz', 'Brócoli', 'Pimiento'],
    tags: ['vegetariano', 'vegano', 'verduras'],
  },
  {
    id: 'hamburguesa-pavo',
    main: 'pavo',
    name: 'Hamburguesa de pavo con ensalada',
    mealType: 'dinner',
    calories: 400, protein: 38, carbs: 15, fats: 20,
    ingredients: ['Carne picada de pavo', 'Lechuga', 'Tomate'],
    tags: ['alto_proteina', 'bajo_carbos', 'verduras'],
  },
  {
    id: 'arroz-verduras-huevo',
    main: 'huevo',
    name: 'Arroz salteado con verduras y huevo',
    mealType: 'lunch',
    calories: 520, protein: 20, carbs: 70, fats: 16,
    ingredients: ['Arroz', 'Huevos', 'Guisantes', 'Zanahoria'],
    tags: ['vegetariano', 'verduras'],
  },
  {
    id: 'pollo-brocoli',
    main: 'pollo',
    name: 'Pechuga de pollo con brócoli al vapor',
    mealType: 'dinner',
    calories: 380, protein: 46, carbs: 12, fats: 14,
    ingredients: ['Pechuga de pollo', 'Brócoli'],
    tags: ['alto_proteina', 'bajo_carbos', 'pocas_calorias', 'verduras'],
  },
  {
    id: 'garbanzos-espinacas',
    main: 'legumbre',
    name: 'Garbanzos con espinacas',
    mealType: 'lunch',
    calories: 430, protein: 22, carbs: 55, fats: 14,
    ingredients: ['Garbanzos', 'Espinacas', 'Ajo'],
    tags: ['vegetariano', 'vegano', 'verduras'],
  },

  // -------------------------------------------------------------------------
  // Snacks y meriendas
  // -------------------------------------------------------------------------
  {
    id: 'yogur-griego',
    main: 'lacteo',
    name: 'Yogur griego natural',
    mealType: 'snack',
    calories: 130, protein: 15, carbs: 6, fats: 5,
    ingredients: ['Yogur griego natural'],
    tags: ['alto_proteina', 'pocas_calorias', 'bajo_carbos', 'rapido', 'vegetariano'],
  },
  {
    id: 'batido-proteina',
    main: 'batido',
    name: 'Batido de proteína con leche',
    mealType: 'snack',
    calories: 250, protein: 30, carbs: 15, fats: 6,
    ingredients: ['Proteína de suero', 'Leche'],
    tags: ['alto_proteina', 'rapido', 'vegetariano'],
  },
  {
    id: 'almendras',
    main: 'fruto_seco',
    name: 'Puñado de almendras',
    mealType: 'snack',
    calories: 170, protein: 6, carbs: 6, fats: 15,
    ingredients: ['Almendras'],
    tags: ['pocas_calorias', 'bajo_carbos', 'rapido', 'vegetariano', 'vegano'],
  },
  {
    id: 'manzana-cacahuete',
    main: 'fruta',
    name: 'Manzana con crema de cacahuete',
    mealType: 'snack',
    calories: 250, protein: 7, carbs: 28, fats: 13,
    ingredients: ['Manzana', 'Crema de cacahuete'],
    tags: ['rapido', 'vegetariano', 'vegano'],
  },
  {
    id: 'requeson-nueces',
    main: 'lacteo',
    name: 'Requesón con nueces',
    mealType: 'snack',
    calories: 220, protein: 18, carbs: 8, fats: 13,
    ingredients: ['Requesón', 'Nueces'],
    tags: ['alto_proteina', 'bajo_carbos', 'rapido', 'vegetariano'],
  },
  {
    id: 'huevos-cocidos',
    main: 'huevo',
    name: 'Dos huevos cocidos',
    mealType: 'snack',
    calories: 155, protein: 13, carbs: 1, fats: 11,
    ingredients: ['Huevos'],
    tags: ['alto_proteina', 'pocas_calorias', 'bajo_carbos', 'rapido', 'vegetariano'],
  },
  {
    id: 'tostada-pavo-aguacate',
    main: 'pavo',
    name: 'Tostada con pavo y aguacate',
    mealType: 'snack',
    calories: 280, protein: 20, carbs: 25, fats: 13,
    ingredients: ['Pan integral', 'Pavo', 'Aguacate'],
    tags: ['alto_proteina', 'rapido'],
  },
  {
    id: 'queso-fresco-tomate',
    main: 'lacteo',
    name: 'Queso fresco con tomate',
    mealType: 'snack',
    calories: 180, protein: 16, carbs: 6, fats: 10,
    ingredients: ['Queso fresco', 'Tomate'],
    tags: ['alto_proteina', 'bajo_carbos', 'pocas_calorias', 'rapido', 'vegetariano'],
  },
  {
    id: 'batido-platano-avena',
    main: 'batido',
    name: 'Batido de plátano y avena',
    mealType: 'snack',
    calories: 320, protein: 12, carbs: 55, fats: 6,
    ingredients: ['Plátano', 'Avena', 'Leche'],
    tags: ['denso', 'rapido', 'vegetariano'],
  },
  {
    id: 'hummus-zanahoria',
    main: 'legumbre',
    name: 'Hummus con bastones de zanahoria',
    mealType: 'snack',
    calories: 200, protein: 8, carbs: 20, fats: 10,
    ingredients: ['Hummus', 'Zanahoria'],
    tags: ['verduras', 'rapido', 'vegetariano', 'vegano'],
  },
  {
    id: 'atun-pan',
    main: 'pescado',
    name: 'Atún con pan integral',
    mealType: 'snack',
    calories: 260, protein: 26, carbs: 22, fats: 7,
    ingredients: ['Atún al natural', 'Pan integral'],
    tags: ['alto_proteina', 'rapido'],
  },
  {
    id: 'fruta-yogur',
    main: 'lacteo',
    name: 'Fruta con yogur natural',
    mealType: 'snack',
    calories: 200, protein: 12, carbs: 30, fats: 4,
    ingredients: ['Fruta de temporada', 'Yogur natural'],
    tags: ['pocas_calorias', 'rapido', 'vegetariano'],
  },
  {
    id: 'tostada-requeson',
    main: 'lacteo',
    name: 'Tostada con requesón y tomate',
    mealType: 'snack',
    calories: 210, protein: 17, carbs: 22, fats: 7,
    ingredients: ['Pan integral', 'Requesón', 'Tomate'],
    tags: ['alto_proteina', 'pocas_calorias', 'rapido', 'vegetariano'],
  },
  {
    id: 'edamame',
    main: 'legumbre',
    name: 'Edamame al vapor',
    mealType: 'snack',
    calories: 190, protein: 17, carbs: 15, fats: 8,
    ingredients: ['Edamame'],
    tags: ['alto_proteina', 'bajo_carbos', 'pocas_calorias', 'rapido', 'vegetariano', 'vegano'],
  },
  {
    id: 'sky-bowl',
    main: 'lacteo',
    name: 'Yogur proteico con semillas de chía',
    mealType: 'snack',
    calories: 190, protein: 20, carbs: 12, fats: 8,
    ingredients: ['Yogur proteico', 'Semillas de chía'],
    tags: ['alto_proteina', 'bajo_carbos', 'pocas_calorias', 'rapido', 'vegetariano'],
  },
];

export default FOODS;
