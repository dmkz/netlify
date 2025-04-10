// analyzeBattles.js
// Для работы в Netlify установите node-fetch: 
//   npm install node-fetch
// и запустите функцию через Netlify.

async function getFetch() {
  const fetchModule = await import("node-fetch");
  return fetchModule.default;
}

const { TextDecoder } = require("util");

// --------------------------
// Вспомогательная функция – удаление HTML-тегов (простая версия)
function stripHTML(html) {
  return html.replace(/<[^>]+>/g, '');
}

// --------------------------
// runTasksWithConcurrency – запускает задачи параллельно с ограничением
function runTasksWithConcurrency(tasks, limit, taskUpdateCallback) {
  let results = new Array(tasks.length);
  let currentIndex = 0;
  let running = 0;
  console.log(`Запуск runTasksWithConcurrency с ${tasks.length} задачами, лимит ${limit}`);
  return new Promise(resolve => {
    function runNext() {
      if (currentIndex >= tasks.length && running === 0) {
        console.log(`Все задачи завершены`);
        resolve(results);
        return;
      }
      while (running < limit && currentIndex < tasks.length) {
        let taskIndex = currentIndex++;
        running++;
        console.log(`Запускаем задачу №${taskIndex}`);
        tasks[taskIndex]()
          .then(result => {
            console.log(`Задача №${taskIndex} завершена успешно`);
            results[taskIndex] = result;
            running--;
            if (taskUpdateCallback) taskUpdateCallback(taskIndex, result);
            runNext();
          })
          .catch(err => {
            console.log(`Задача №${taskIndex} завершилась с ошибкой: ${err.message}`);
            results[taskIndex] = { link: tasks[taskIndex].link, result: null, status: "error", error: err.message };
            running--;
            if (taskUpdateCallback) taskUpdateCallback(taskIndex, { error: err.message });
            runNext();
          });
      }
    }
    runNext();
  });
}

// --------------------------
// Функция fetchProtocolPage – для получения страницы протокола.
// (В этом примере она может не использоваться, но включена для полноты.)
async function fetchProtocolPage(url) {
  const fetchFn = await getFetch();
  const response = await fetchFn(url);
  const buffer = await response.arrayBuffer();
  let decoder = new TextDecoder("windows-1251");
  return decoder.decode(Buffer.from(buffer));
}

async function fetchBattlePage(url) {
  const fetchFn = await getFetch();
  const response = await fetchFn(url);
  return response.text();
}

// --------------------------
// splitSideText – разбивает строку по <br>
function splitSideText(sideText) {
  let cleaned = sideText.replace(/(\d),(\d)/g, "$1$2");
  let lines = cleaned.split(/<br\s*\/?>/gi).map(line => line.trim()).filter(line => line !== "");
  console.log(`splitSideText: получено ${lines.length} строк`);
  return lines;
}

// --------------------------
// processReserveLines – разбирает каждую строку и возвращает объект { tokensByLine, reserve }
function processReserveLines(lines, sideName, battleId) {
  console.log(`processReserveLines: Обработка ${lines.length} строк для ${sideName} боя ${battleId}`);
  let reserveInfo = [];
  let tokensByLine = [];
  lines.forEach(line => {
    let normalized = line.replace(/ и /g, ", ").replace(/ получает /g, ", ");
    normalized = normalized.replace(/(в резерв)(?!,)/g, "$1,")
                           .replace(/\b(опыт[а-я]*)(?![,.:])/iu, "$1,")
                           .replace(/( золота)(?![,.:])/g, "$1,");
    let tokens = normalized.split(", ").map(t => t.trim());
    tokensByLine.push({ originalLine: line, tokens: tokens.slice() });
    // Если строка содержит ваш ник – замените "oxotnik102rus" на ваш реальный ник.
    if (tokens.some(token => token.includes("oxotnik102rus"))) {
      tokens.forEach(token => {
        if (token.includes("(+") && token.includes("в резерв")) {
          let plusIdx = token.indexOf("(+");
          let closeIdx = token.indexOf(")", plusIdx);
          if (plusIdx !== -1 && closeIdx !== -1) {
            let creatureRaw = token.substring(0, plusIdx).trim();
            let creatureMatch = creatureRaw.match(/\p{Lu}[\p{Ll}\s\-]*/u);
            let creature = creatureMatch ? creatureMatch[0].trim() : creatureRaw;
            let countStr = token.substring(plusIdx + 2, closeIdx).trim().replace(/,/g, '');
            let count = parseInt(countStr, 10);
            if (!isNaN(count)) {
              reserveInfo.push({ creature, count });
            }
          }
        }
      });
    }
  });
  console.log(`processReserveLines: Найдено ${reserveInfo.length} резервов`);
  return { tokensByLine, reserve: reserveInfo };
}

// --------------------------
// parseArmyInfo – парсит строку с информацией об армии.
function parseArmyInfo(armyString) {
  console.log(`parseArmyInfo: Длина строки = ${armyString.length}`);
  if (armyString.length < 144) return null;
  let rawBlock = armyString.substring(0, 144);
  let groups = [];
  for (let i = 0; i < 24; i++) {
    groups.push(rawBlock.substr(i * 6, 6));
  }
  let numbers = groups.map(g => parseFloat(g));
  let params = {
    sideNumber: numbers[0],
    healthPerUnit: numbers[2],
    totalHealth: numbers[3],
    minDamage: numbers[4],
    maxDamage: numbers[5],
    remainingMana: numbers[6],
    initialMana: numbers[7],
    speedOrKnowledge: numbers[8],
    initiative: numbers[10],
    magicOrCount: numbers[11],
    survivors: numbers[12],
    fieldColumn: numbers[13],
    fieldRow: numbers[14],
    arrowDistance: numbers[15],
    remainingShots: numbers[16],
    attack: numbers[17],
    defense: numbers[18],
    morale: numbers[19],
    luck: numbers[20]
  };
  let extraInfo = armyString.substring(144).trim();
  let extra = {};
  if (extraInfo.startsWith("@")) {
    let withoutAt = extraInfo.substring(1);
    let parts = withoutAt.split("~");
    if (parts.length >= 2) {
      let heroInfo = parts[1];
      let fields = heroInfo.split("|");
      if (fields.length >= 3) {
        extra.shortName = fields[0].trim();
        extra.fullName = fields[2].split('#')[0].trim();
        extra.type = "hero";
      }
    }
  } else {
    let fields = extraInfo.split("|");
    if (fields.length >= 3) {
      extra.shortName = fields[0].trim();
      extra.fullName = fields[2].split("#")[0].trim();
      extra.type = "unit";
    }
  }
  console.log(`parseArmyInfo: extra.type = ${extra.type}`);
  return { params, extra };
}

// --------------------------
// buildMoments – группирует данные из armyMatches в моменты.
function buildMoments(armyMatches) {
  console.log(`buildMoments: Всего armyMatches: ${armyMatches.length}`);
  let moments = [];
  let currentMoment = null;
  let previousId = null;
  armyMatches.forEach(match => {
    let currentId = parseInt(match.id, 10);
    if (currentMoment === null || (previousId !== null && currentId < previousId)) {
      currentMoment = { sides: [], momentId: moments.length + 1 };
      moments.push(currentMoment);
    }
    previousId = currentId;
    let sideIndex = (match.armyData && typeof match.armyData.params.sideNumber === 'number')
      ? match.armyData.params.sideNumber : 0;
    if (!currentMoment.sides[sideIndex]) {
      currentMoment.sides[sideIndex] = {};
    }
    let sideGroup = currentMoment.sides[sideIndex];
    let itemName = "";
    let itemCount = 0;
    let initialHealth = 0;
    let remainingHealth = 0;
    let details = "";
    if (match.armyData && match.armyData.extra) {
      if (match.armyData.extra.type === "hero") {
        itemName = match.armyData.extra.fullName || match.armyData.extra.shortName || "";
        itemCount = 1;
        initialHealth = 0;
        remainingHealth = 0;
        details = `${itemName}[Уровень: ${match.armyData.params.healthPerUnit}][Нападение: ${match.armyData.params.attack}, Защита: ${match.armyData.params.defense}, Сила Магии: ${match.armyData.params.magicOrCount}, Знания: ${match.armyData.params.speedOrKnowledge}, Удача: ${match.armyData.params.luck}, Боевой Дух: ${match.armyData.params.morale}]`;
      } else {
        if (match.armyData.extra.fullName) {
          itemName = match.armyData.extra.fullName.trim();
        } else {
          itemName = match.armyData.extra.shortName || "";
        }
        itemCount = match.armyData.params.magicOrCount;
        let unitHealth = match.armyData.params.healthPerUnit;
        initialHealth = itemCount * unitHealth;
        remainingHealth = Math.max(0, (match.armyData.params.survivors - 1) * unitHealth + match.armyData.params.totalHealth);
        details = `${itemName} (${itemCount})`;
      }
    }
    if (!sideGroup[itemName]) {
      sideGroup[itemName] = {
        count: itemCount,
        initialHealth: initialHealth,
        remainingHealth: remainingHealth,
        details: details
      };
    } else {
      sideGroup[itemName].count += itemCount;
      sideGroup[itemName].initialHealth += initialHealth;
      sideGroup[itemName].remainingHealth += remainingHealth;
      if (match.armyData && match.armyData.extra && match.armyData.extra.type === "hero") {
        sideGroup[itemName].details = details;
      } else {
        sideGroup[itemName].details = `${itemName} (${sideGroup[itemName].count})`;
      }
    }
  });
  console.log(`buildMoments: получено ${moments.length} моментов`);
  return moments;
}

// --------------------------
// Маппинги фракций.
const factionSets = [
  { faction: "Рыцарь", variant: 1, creatures: ["Крестьяне", "Лучники", "Пехотинцы", "Грифоны", "Монахи", "Рыцари", "Ангелы"] },
  { faction: "Рыцарь", variant: 2, creatures: ["Ополченцы", "Арбалетчики", "Латники", "Имперские грифоны", "Инквизиторы", "Паладины", "Архангелы"] },
  { faction: "Рыцарь Света", variant: 1, creatures: ["Головорезы", "Стрелки", "Защитники веры", "Штурмовые грифоны", "Адепты", "Чемпионы", "Высшие ангелы"] },
  { faction: "Некромант", variant: 1, creatures: ["Скелеты", "Зомби", "Привидения", "Вампиры", "Личи", "Умертвия", "Костяные драконы"] },
  { faction: "Некромант", variant: 2, creatures: ["Скелеты-лучники", "Чумные зомби", "Призраки", "Высшие вампиры", "Архиличи", "Вестники смерти", "Призрачные драконы"] },
  { faction: "Некромант - Повелитель Смерти", variant: 1, creatures: ["Скелеты-воины", "Гниющие зомби", "Духи", "Князья вампиров", "Высшие личи", "Баньши", "Астральные драконы"] },
  { faction: "Варвар", variant: 1, creatures: ["Гоблины", "Наездники на волках", "Орки", "Огры", "Роки", "Циклопы", "Бегемоты"] },
  { faction: "Варвар", variant: 2, creatures: ["Хобгоблины", "Налётчики на волках", "Орки-вожди", "Огры-маги", "Птицы грома", "Циклопы-короли", "Древние бегемоты"] },
  { faction: "Варвар Крови", variant: 1, creatures: ["Гоблины-лучники", "Наездники на кабанах", "Орки-тираны", "Огры-ветераны", "Огненные птицы", "Циклопы-генералы", "Свирепые бегемоты"] },
  { faction: "Варвар-Шаман", variant: 1, creatures: ["Гоблины-маги", "Наездники на гиенах", "Орки-шаманы", "Огры-шаманы", "Птицы тьмы", "Циклопы-шаманы", "Проклятые бегемоты"] },
  { faction: "Темный Эльф", variant: 1, creatures: ["Лазутчики", "Бестии", "Минотавры", "Наездники на ящерах", "Гидры", "Сумеречные ведьмы", "Сумеречные драконы"] },
  { faction: "Темный Эльф", variant: 2, creatures: ["Ассасины", "Фурии", "Минотавры-стражи", "Тёмные всадники", "Пещерные гидры", "Владычицы тени", "Чёрные драконы"] },
  { faction: "Темный Эльф-Укротитель", variant: 1, creatures: ["Ловчие", "Мегеры", "Минотавры-надсмотрщики", "Проворные наездники", "Тёмные гидры", "Хозяйки ночи", "Красные драконы"] },
  { faction: "Маг", variant: 1, creatures: ["Гремлины", "Каменные горгульи", "Железные големы", "Маги", "Джинны", "Принцессы ракшас", "Колоссы"] },
  { faction: "Маг", variant: 2, creatures: ["Старшие гремлины", "Обсидиановые горгульи", "Стальные големы", "Архимаги", "Джинны-султаны", "Раджи ракшас", "Титаны"] },
  { faction: "Маг-Разрушитель", variant: 1, creatures: ["Гремлины-вредители", "Стихийные горгульи", "Магнитные големы", "Боевые маги", "Визири джиннов", "Кшатрии ракшасы", "Титаны шторма"] },
  { faction: "Демон", variant: 1, creatures: ["Бесы", "Рогатые демоны", "Адские псы", "Суккубы", "Адские жеребцы", "Пещерные демоны", "Дьяволы"] },
  { faction: "Демон", variant: 2, creatures: ["Черти", "Огненные демоны", "Церберы", "Демонессы", "Кошмары", "Пещерные владыки", "Архидьяволы"] },
  { faction: "Демон Тьмы", variant: 1, creatures: ["Дьяволята", "Старшие демоны", "Огненные гончие", "Искусительницы", "Кони преисподней", "Пещерные отродья", "Архидемоны"] },
  { faction: "Гном", variant: 1, creatures: ["Защитники гор", "Метатели копья", "Наездники на медведях", "Костоломы", "Жрецы рун", "Таны", "Огненные драконы"] },
  { faction: "Гном", variant: 2, creatures: ["Воители", "Мастера копья", "Хозяева медведей", "Берсерки", "Старейшины рун", "Громовержцы", "Магма драконы"] },
  { faction: "Гном Огня", variant: 1, creatures: ["Горные стражи", "Гарпунеры", "Северные наездники", "Воины ярости", "Жрецы пламени", "Ярлы", "Лавовые драконы"] },
  { faction: "Степной Варвар", variant: 1, creatures: ["Степные гоблины", "Кентавры", "Степные воины", "Шаманки", "Убийцы", "Виверны", "Степные циклопы"] },
  { faction: "Степной Варвар", variant: 2, creatures: ["Гоблины-трапперы", "Кочевые кентавры", "Степные бойцы", "Дочери неба", "Палачи", "Тёмные виверны", "Свободные циклопы"] },
  { faction: "Степной Варвар Ярости", variant: 1, creatures: ["Гоблины-шаманы", "Боевые кентавры", "Вармонгеры", "Дочери земли", "Вожаки", "Безглазые виверны", "Кровоглазые циклопы"] },
  { faction: "Фараон", variant: 1, creatures: ["Скорпионы", "Пустынные рейдеры", "Шакалы", "Наездники на верблюдах", "Жрицы луны", "Боевые слоны", "Слуги Анубиса"] },
  { faction: "Фараон", variant: 2, creatures: ["Черные скорпионы", "Пустынные убийцы", "Шакалы-воины", "Налетчики на верблюдах", "Жрицы солнца", "Штурмовые слоны", "Воины Анубиса"] },
  { faction: "Эльф", variant: 1, creatures: ["Феи", "Танцующие с клинками", "Эльфийские лучники", "Друиды", "Единороги", "Энты", "Зелёные драконы"] },
  { faction: "Эльф", variant: 2, creatures: ["Дриады", "Танцующие со смертью", "Мастера лука", "Верховные друиды", "Боевые единороги", "Древние энты", "Изумрудные драконы"] },
  { faction: "Эльф-Заклинатель", variant: 1, creatures: ["Нимфы", "Танцующие с ветром", "Лесные снайперы", "Старшие друиды", "Светлые единороги", "Дикие энты", "Кристальные драконы"] }
];

// --------------------------
// Функция, определяющая фракцию для sideAggregate.
function determineFaction(sideAggregate, threshold = 0.5) {
  let bestMatch = null;
  let bestScore = 0;
  const validKeys = Object.keys(sideAggregate).filter(name => {
    if (name === "faction") return false;
    const obj = sideAggregate[name];
    return !(obj.initialHealth === 0 && obj.remainingHealth === 0);
  });
  factionSets.forEach(mapping => {
    let score = 0;
    validKeys.forEach(name => {
        let lowerName = name.toLowerCase().trim();
        console.log("lowerName " + lowerName);
        mapping.creatures.forEach(mappedName => {
        if (lowerName === mappedName.toLowerCase()) {
          console.log("found " + mappedName);
          let cnt = (sideAggregate[name] && sideAggregate[name].count) ? sideAggregate[name].count : 1;
          score += 1;
        }
      });
    });
    if (score > bestScore) {
        bestScore = score;
        bestMatch = mapping;
    }
  });
  let total = validKeys.reduce((sum, name) => {
    return sum + ((sideAggregate[name] && sideAggregate[name].count) ? 1 : 0);
  }, 0);
  if (bestMatch) {
    console.log("Faction" + bestMatch.faction + ", score: " + bestScore + ", total: " + total);
  }
  if (bestMatch && total > 0 && (bestScore / total) >= threshold) {
    return bestMatch.faction;
  }
  return "Не определена";
}

// --------------------------
// Функция обогащения tokensByLine.
function enrichTokensByLine(tokensByLine, moments) {
  const colorToSideMap = {
    "#FF0000": 1,
    "#0000FF": 2,
    "#900000": 3,
    "#0090FF": 4,
    "#F47B02": 5,
    "#BB24FD": 6,
    "#007B32": 7,
    "#A337AE": 8
  };
  const colorRegex = /color="(#[0-9A-Fa-f]{6})"/;
  tokensByLine.forEach(line => {
    let foundColor = null;
    for (let token of line.tokens) {
      let match = token.match(colorRegex);
      if (match) { foundColor = match[1]; break; }
    }
    if (foundColor) {
      let sideNumber = colorToSideMap[foundColor];
      if (sideNumber && moments[0] && moments[0].sides && moments[0].sides[sideNumber]) {
        let aggregate = moments[0].sides[sideNumber];
        aggregate.faction = determineFaction(aggregate);
        line.sideAggregate = aggregate;
      }
    }
  });
}

// --------------------------
// Функция создания фиктивных строк токенов для незатронутых сторон.
function createFakeTokenLinesForUnmatchedArmies(winTokensByLine, loseTokensByLine, moments) {
  const sideColors = {
    1: "#FF0000",
    2: "#0000FF",
    3: "#900000",
    4: "#0090FF",
    5: "#F47B02",
    6: "#BB24FD",
    7: "#007B32",
    8: "#A337AE"
  };
  if (!moments || !moments[0] || !moments[0].sides) return;
  moments[0].sides.forEach((sideAggregate, sideIndex) => {
    if (sideAggregate) {
      let found1 = winTokensByLine.some(tokenLine => tokenLine.sideAggregate === sideAggregate);
      let found2 = loseTokensByLine.some(tokenLine => tokenLine.sideAggregate === sideAggregate);
      if (!found1 && !found2 && sideIndex > 0) {
        sideAggregate.faction = determineFaction(sideAggregate);
        let fakeLine = {
          originalLine: `<b><font color="${sideColors[sideIndex]}">Анонимная армия ${sideIndex}</font></b>`,
          tokens: [`<b><font color="${sideColors[sideIndex]}">Анонимная армия ${sideIndex}</font></b>`],
          sideAggregate: sideAggregate
        };
        winTokensByLine.push(fakeLine);
      }
    }
  });
}

// --------------------------
// Функция форматирования одной линии токенов.
function formatTokenLine(tokenLine, isWinner) {
  let firstToken = tokenLine.tokens.length > 0 ? stripHTML(tokenLine.tokens[0]) : "";
  let remainingTokens = tokenLine.tokens.slice(1).map(stripHTML).join(", ");
  let result = "";
  if (tokenLine.sideAggregate) {
    let totalInitial = 0;
    let totalRemaining = 0;
    let heroesDetails = [];
    let unitsDetails = [];
    for (let unit in tokenLine.sideAggregate) {
      if (unit === "faction") continue;
      let data = tokenLine.sideAggregate[unit];
      if (typeof data === "object") {
        totalInitial += data.initialHealth || 0;
        totalRemaining += data.remainingHealth || 0;
        if (data.details) {
          if (data.details.indexOf("Нападение:") !== -1) {
            heroesDetails.push(data.details);
          } else {
            unitsDetails.push(data.details);
          }
        }
      }
    }
    let percent = totalInitial > 0 ? ((totalRemaining / totalInitial) * 100).toFixed(2) + "%" : "N/A";
    let faction = tokenLine.sideAggregate.faction || "Не определена";
    result += isWinner ? "[win!] " : "[lose] ";
    result += "[" + firstToken + "] ";
    result += "[" + totalInitial + " ХП] ";
    result += "[" + percent + " выжило] ";
    result += "[" + faction + "] ";
    if (heroesDetails.length > 0) { result += "[" + heroesDetails.join(", ") + "] "; }
    if (unitsDetails.length > 0) { result += "[" + unitsDetails.join(", ") + "] "; }
    if (remainingTokens) { result += "[" + remainingTokens + "]"; }
  } else {
    let tokensText = tokenLine.tokens.map(stripHTML).join(", ");
    result += "[?] [" + tokensText + "]";
  }
  return result;
}

function tokensToLine(winTokens, loseTokens) {
  let result = "";
  winTokens.forEach(line => { result += formatTokenLine(line, true) + "\n"; });
  loseTokens.forEach(line => { result += formatTokenLine(line, false) + "\n"; });
  return result;
}

// --------------------------
// Функция transformHeroBlock – обрабатывает информацию о героях.
function transformHeroBlock(heroBlock, isWinner, opts) {
  if ((isWinner && !opts.showWinningHeroInfo) || (!isWinner && !opts.showLosingHeroInfo)) {
    return "";
  }
  let firstBracket = heroBlock.indexOf("[");
  let nickname = firstBracket !== -1 ? heroBlock.substring(0, firstBracket).trim() : heroBlock.trim();
  let blocks = [];
  if (firstBracket !== -1) {
    let regex = /\[([^\]]+)\]/g;
    let m;
    while ((m = regex.exec(heroBlock)) !== null) {
      blocks.push(m[1]);
    }
  }
  let levelBlock = "";
  let paramsBlock = "";
  if (blocks.length > 0) {
    if (/Уровень:|^У:/i.test(blocks[0])) {
      levelBlock = blocks[0];
      if (blocks.length > 1) { paramsBlock = blocks.slice(1).join("]["); }
    } else { paramsBlock = blocks.join("]["); }
  }
  if ((isWinner && !opts.showWinningHeroNickname) || (!isWinner && !opts.showLosingHeroNickname)) {
    nickname = "";
  }
  if ((isWinner && !opts.showWinningHeroLevel) || (!isWinner && !opts.showLosingHeroLevel)) {
    levelBlock = "";
  } else if (levelBlock && ((isWinner && opts.shortenWinningHeroParams) || (!isWinner && opts.shortenLosingHeroParams))) {
    levelBlock = levelBlock.replace(/Уровень:/gi, "У:").replace(/\s+/g, "");
  }
  if ((isWinner && !opts.showWinningHeroParams) || (!isWinner && !opts.showLosingHeroParams)) {
    paramsBlock = "";
  } else if (paramsBlock) {
    let tmp = "[" + paramsBlock + "]";
    if ((isWinner && opts.shortenWinningHeroParams) || (!isWinner && opts.shortenLosingHeroParams)) {
      tmp = shortenHeroParams(tmp);
    }
    paramsBlock = tmp;
  }
  let result = (nickname + (levelBlock ? "[" + levelBlock + "]" : "") + paramsBlock).trim();
  return result;
}

/**
 * Функция сокращения параметров героя.
 */
function shortenHeroParams(paramsBlock) {
  const mapping = {
    "Нападение:": "Н:",
    "Защита:": "З:",
    "Сила магии:": "СМ:",
    "Знания:": "ЗН:",
    "Удача:": "Уд:",
    "Боевой Дух:": "БД:",
    "Уровень:": "У:"
  };
  for (let key in mapping) {
    let shortKey = mapping[key];
    let regex = new RegExp(key, "gi");
    paramsBlock = paramsBlock.replace(regex, shortKey);
  }
  return paramsBlock.replace(/\s+/g, "");
}

function transformLine(line, opts) {
  let trimmed = line.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("[")) return line;
  let inner = trimmed.substring(1, trimmed.length - 1);
  let blocks = inner.split("] [");
  let marker = blocks[0];
  let isWinner = (marker.toLowerCase().indexOf("win") !== -1 || marker.indexOf("+") !== -1);
  if (opts.shortenMarkers && (marker.toLowerCase().indexOf("win") !== -1 || marker.toLowerCase().indexOf("lose") !== -1)) {
    blocks[0] = isWinner ? "+" : "-";
  }
  if ((isWinner && !opts.showWinningSideName) || (!isWinner && !opts.showLosingSideName)) { blocks[1] = ""; }
  if ((isWinner && !opts.showWinningHP) || (!isWinner && !opts.showLosingHP)) { blocks[2] = ""; }
  if ((isWinner && !opts.showWinningPercent) || (!isWinner && !opts.showLosingPercent)) { blocks[3] = ""; }
  if ((isWinner && !opts.showWinningFaction) || (!isWinner && !opts.showLosingFaction)) { blocks[4] = ""; }
  if (blocks.length > 5) { blocks[5] = transformHeroBlock(blocks[5], isWinner, opts); }
  if (blocks.length > 6) {
    if ((isWinner && !opts.showWinningArmy) || (!isWinner && !opts.showLosingArmy)) { blocks[6] = ""; }
  }
  if (blocks.length > 7) {
    if ((isWinner && !opts.showWinningBonuses) || (!isWinner && !opts.showLosingBonuses)) { blocks[7] = ""; }
  }
  let newLine = blocks.filter(b => b !== "").map(b => "[" + b + "]").join(" ");
  return newLine;
}

function transformTokensText(inputText, opts) {
  let lines = inputText.split("\n");
  let transformed = lines.map(line => transformLine(line, opts));
  return transformed.join("\n");
}

// --------------------------
// Netlify Handler
// --------------------------
exports.handler = async function(event, context) {
  const TIMEOUT = 10000;
  try {
    console.log("Начало обработки запроса");
    let body = JSON.parse(event.body);
    let links = body.links;
    if (!Array.isArray(links)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Параметр 'links' должен быть массивом." }) };
    }
    links = [...new Set(links)];
    console.log("Получено ссылок: ", links.length);
    let tasks = links.map(link => {
      let task = () => analyzeBattleByLink(link);
      task.link = link;
      return task;
    });
    let concurrencyLimit = 50;
    let timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Время ожидания истекло")), TIMEOUT);
    });
    let analysisPromise = runTasksWithConcurrency(tasks, concurrencyLimit);
    let results = await Promise.race([analysisPromise, timeoutPromise])
      .catch(async err => {
        console.error("Ошибка или таймаут в runTasksWithConcurrency:", err.message);
        let settled = await Promise.allSettled(tasks.map(t => t()));
        return settled.map((res, idx) => {
          if (res.status === "fulfilled") return res.value;
          else return { link: links[idx], result: null, status: "error", error: "Таймаут или ошибка" };
        });
      });
    console.log("Задачи завершены, результатов: ", results.length);
    return {
      statusCode: 200,
      body: JSON.stringify({ results })
    };
  } catch (err) {
    console.error("Фатальная ошибка в handler:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// --------------------------
// Функция analyzeBattleByLink – использует ваш анализ боёв.
async function analyzeBattleByLink(link) {
  try {
    console.log(`Начало анализа: ${link}`);
    let battle = { battleLink: link };
    let data = await fetchBattleData(battle);
    console.log(`Данные для ${link}: success=${data.success}`);
    if (data.success) {
      let resultStr = tokensToLine(data.reserve.winners.tokensByLine, data.reserve.losers.tokensByLine);
      console.log(`Анализ успешно завершён для ${link}`);
      return { link, result: resultStr, status: "success" };
    } else {
      console.log(`Анализ неуспешен для ${link}`);
      return { link, result: null, status: "error", error: "Анализ неуспешен" };
    }
  } catch (err) {
    console.error(`Ошибка анализа для ${link}:`, err.message);
    return { link, result: null, status: "error", error: err.message };
  }
}

// --------------------------
// Функция fetchBattleData – извлекает данные боя через battle.php.
function fetchBattleData(battle) {
  let linkUrl;
  try {
    linkUrl = new URL(battle.battleLink, "https://www.heroeswm.ru/");
  } catch (e) {
    console.error("Ошибка парсинга battleLink:", battle.battleLink);
    return Promise.resolve({
      success: false,
      warid: null,
      turns: null,
      reserve: { winners: { reserve: [], tokensByLine: [] }, losers: { reserve: [], tokensByLine: [] } },
      battleLink: battle.battleLink
    });
  }
  let warid = linkUrl.searchParams.get("warid");
  let show_enemy = linkUrl.searchParams.get("show_enemy") || "";
  let secretCode = linkUrl.searchParams.get("show") ||
                   linkUrl.searchParams.get("show_for_all") ||
                   linkUrl.searchParams.get("showt") || "";
  let rand = Date.now();
  const url = `https://www.heroeswm.ru/battle.php?warid=${encodeURIComponent(warid)}&lastturn=-2&lastmess=-1&lastmess2=-1&rand=${rand}&showinsertion=1&pl_id=0&lastdata=1&show_for_all=${encodeURIComponent(secretCode)}&show_enemy=${encodeURIComponent(show_enemy)}`;
  console.log(`Запрос к battle.php: ${url}`);
  return fetchBattlePage(url)
    .then(html => {
      console.log(`Получен HTML для боя ${battle.battleLink}, длина: ${html.length}`);
      let start = html.indexOf("turns=>");
      let turnsStr = null;
      if (start !== -1) {
        start += "turns=>".length;
        let end = html.indexOf(":", start);
        if (end !== -1) { turnsStr = html.substring(start, end).trim(); }
      }
      let battleLog = "";
      let logStart = html.search(/>\d+:/);
      if (logStart !== -1) {
        let logEnd = html.indexOf("f<font", logStart);
        if (logEnd !== -1) {
          battleLog = html.substring(logStart, logEnd);
          html = html.substring(0, logStart) + html.substring(logEnd);
        }
      }
      let winnersMarkerStart = `<font size="18"><b>Победившая сторона:</b></font><br />`;
      let winnersMarkerEnd = `<br /><font size="18"><b>Проигравшая сторона:</b></font><br />`;
      let losersMarkerStart = `<font size="18"><b>Проигравшая сторона:</b></font><br />`;
      let losersMarkerEnd = `<br />|`;
      let winnersBlock = "";
      let losersBlock = "";
      if (html.indexOf(winnersMarkerStart) !== -1 && html.indexOf(winnersMarkerEnd) !== -1) {
        winnersBlock = html.substring(html.indexOf(winnersMarkerStart) + winnersMarkerStart.length, html.indexOf(winnersMarkerEnd));
      }
      let losersEndIdx = html.indexOf(losersMarkerEnd, html.indexOf(losersMarkerStart));
      if (html.indexOf(losersMarkerStart) !== -1 && losersEndIdx !== -1) {
        losersBlock = html.substring(html.indexOf(losersMarkerStart) + losersMarkerStart.length, losersEndIdx);
      }
      console.log(`winnersBlock длина: ${winnersBlock.length}, losersBlock длина: ${losersBlock.length}`);
      let winnersLines = splitSideText(winnersBlock);
      let losersLines = splitSideText(losersBlock);
      let winnersData = processReserveLines(winnersLines, "Winners", warid);
      let losersData = processReserveLines(losersLines, "Losers", warid);
      let armyMatches = [];
      let armyRegex = /M(\d{3}):([^;]+);/g;
      let match;
      while ((match = armyRegex.exec(html)) !== null) {
        let rawArmyString = match[2];
        let armyData = null;
        if (rawArmyString.length >= 144) {
          armyData = parseArmyInfo(rawArmyString);
        }
        armyMatches.push({ id: match[1], armyData: armyData, raw: rawArmyString });
      }
      console.log(`Найдено ${armyMatches.length} armyMatches`);
      let moments = buildMoments(armyMatches);
      enrichTokensByLine(winnersData.tokensByLine, moments);
      enrichTokensByLine(losersData.tokensByLine, moments);
      createFakeTokenLinesForUnmatchedArmies(winnersData.tokensByLine, losersData.tokensByLine, moments);
      let battleData = {
        success: true,
        warid: warid,
        turns: turnsStr,
        reserve: { winners: winnersData, losers: losersData },
        battleLink: battle.battleLink,
        rawHtml: html,
        army: armyMatches
      };
      console.log(`fetchBattleData: Анализ боя ${battle.battleLink} завершён успешно.`);
      return battleData;
    })
    .catch(err => {
      console.error(`Ошибка анализа боя с ссылкой=${battle.battleLink}: ${err}`);
      return {
        success: false,
        warid: warid,
        turns: null,
        reserve: { winners: { reserve: [], tokensByLine: [] }, losers: { reserve: [], tokensByLine: [] } },
        battleLink: battle.battleLink
      };
    });
}
