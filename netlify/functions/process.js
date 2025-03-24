const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// Функция для получения и декодирования HTML из windows-1251
async function fetchAndDecode(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ошибка при запросе ${url}: статус ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const decoded = iconv.decode(Buffer.from(buffer), 'windows-1251');
  return decoded;
}

exports.handler = async (event, context) => {
  console.log('Получен запрос:', event.httpMethod);
  if (event.httpMethod !== 'POST') {
    console.log('Неподдерживаемый HTTP метод:', event.httpMethod);
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { default: fetch } = await import('node-fetch');
    const body = JSON.parse(event.body);
    console.log('Полученное тело запроса:', body);
    
    const { techClanIds, battleClanIds, excludePlayers } = body;
    const techIds = techClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const battleIds = battleClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const excludeSet = new Set(
      excludePlayers.split('\n').map(s => s.trim()).filter(Boolean)
    );
    console.log('Технические кланы (IDs):', techIds);
    console.log('Боевые кланы (IDs):', battleIds);
    console.log('Игроки для исключения:', Array.from(excludeSet));

    // Функция для получения информации о клане (название и участники из последней таблицы)
    async function fetchClan(clanId) {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${clanId}`;
      console.log(`Запрос к клану ${clanId} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      const $ = cheerio.load(html);
      let clanName = $('h1').first().text().trim();
      const tables = $('table');
      const lastTable = tables.last();
      let members = [];
      lastTable.find('tr').each((i, tr) => {
        const a = $(tr).find('a[href*="pl_info.php?id="]');
        if (a.length > 0) {
          const href = a.attr('href');
          const match = href.match(/pl_info\.php\?id=(\d+)/);
          if (match) {
            members.push({
              id: match[1],
              name: a.text().trim()
            });
          }
        }
      });
      console.log(`Клан ${clanId} (${clanName}) — найдено участников: ${members.length}`);
      return { clanId, clanName, members };
    }

    // Функция для проверки личной страницы игрока с новой логикой
    async function classifyPlayer(player) {
      const url = `https://www.heroeswm.ru/pl_info.php?id=${player.id}`;
      console.log(`Проверка игрока ${player.id} по URL: ${url}`);
      try {
        const html = await fetchAndDecode(url);
        const h1Index = html.indexOf("<h1");
        if (h1Index === -1) {
          console.log(`Игрок ${player.id}: <h1 не найден, считаем его без клана`);
          return { ...player, classification: "clanless" };
        }
        const headerSection = html.substring(0, h1Index);
        // Пытаемся найти ссылку с одинарными кавычками
        let prefix = "<a href='clan_info.php?id=";
        let aIndex = headerSection.indexOf(prefix);
        if (aIndex === -1) {
          // Если не найдено, пробуем с двойными кавычками
          prefix = '<a href="clan_info.php?id=';
          aIndex = headerSection.indexOf(prefix);
        }
        if (aIndex === -1) {
          console.log(`Игрок ${player.id}: ссылка на clan_info не найдена в верхней части, считаем его без клана`);
          return { ...player, classification: "clanless" };
        }
        const startId = aIndex + prefix.length;
        const endId = headerSection.indexOf(prefix.startsWith("<a href='") ? "'" : '"', startId);
        if (endId === -1) {
          console.log(`Игрок ${player.id}: не удалось извлечь идентификатор клана`);
          return { ...player, classification: "unknown" };
        }
        const joinedClanId = headerSection.substring(startId, endId);
        // Аналогично ищем атрибут title, пытаясь сначала с одинарными кавычками, потом с двойными
        let titleAttr = "title='";
        let titleIndex = headerSection.indexOf(titleAttr, endId);
        if (titleIndex === -1) {
          titleAttr = 'title="';
          titleIndex = headerSection.indexOf(titleAttr, endId);
        }
        if (titleIndex === -1) {
          console.log(`Игрок ${player.id}: не найден атрибут title для клана ${joinedClanId}`);
          return { ...player, classification: "enemy", joinedClanId, joinedClanName: "Неизвестно" };
        }
        const startTitle = titleIndex + titleAttr.length;
        const endTitle = headerSection.indexOf(titleAttr.startsWith("title='") ? "'" : '"', startTitle);
        if (endTitle === -1) {
          console.log(`Игрок ${player.id}: не удалось извлечь название клана для ${joinedClanId}`);
          return { ...player, classification: "enemy", joinedClanId, joinedClanName: "Неизвестно" };
        }
        const joinedClanName = headerSection.substring(startTitle, endTitle);
        console.log(`Игрок ${player.id} классифицирован как enemy, клан: ${joinedClanId} (${joinedClanName})`);
        // Если игрок уже исключён, помечаем его
        const alreadyExcluded = excludeSet.has(player.id);
        return { ...player, classification: "enemy", joinedClanId, joinedClanName, alreadyExcluded };
      } catch (err) {
        console.error(`Ошибка при проверке игрока ${player.id}:`, err);
        return { ...player, classification: "unknown" };
      }
    }

    // Получаем данные для технических и боевых кланов
    const techClans = await Promise.all(techIds.map(id => fetchClan(id)));
    const battleClans = await Promise.all(battleIds.map(id => fetchClan(id)));
    console.log('Получено технических кланов:', techClans.length);
    console.log('Получено боевых кланов:', battleClans.length);

    // Группируем участников боевых кланов
    const battleClanMembers = {};
    battleClans.forEach(clan => {
      battleClanMembers[clan.clanId] = clan.members;
    });
    const battleMembersMap = new Map();
    battleClans.forEach(clan => {
      clan.members.forEach(member => {
        battleMembersMap.set(member.id, { clanId: clan.clanId, clanName: clan.clanName });
      });
    });

    // Для каждого технического клана формируем результаты
    const results = await Promise.all(techClans.map(async techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));

      // Группируем для приглашения: игроки из боевых кланов, которых нет в текущем тех. клане и не исключены
      const inviteGroups = {};
      battleMembersMap.forEach((info, memberId) => {
        if (!techMemberIds.has(memberId) && excludeSet.has(memberId) === false) {
          if (!inviteGroups[info.clanId]) {
            inviteGroups[info.clanId] = { clanName: info.clanName, players: [] };
          }
          const memberDetail = battleClanMembers[info.clanId].find(m => m.id === memberId);
          if (memberDetail) {
            inviteGroups[info.clanId].players.push(memberDetail);
          }
        }
      });

      // Для членов тех. клана, которых нет в боевых кланов (вне battleMembersMap)
      // (НЕ фильтруем по excludeSet, чтобы даже исключённых отображались с пометкой)
      const rawCandidates = techClan.members.filter(member => !battleMembersMap.has(member.id));
      const classified = await Promise.all(rawCandidates.map(player => classifyPlayer(player)));
      const enemyCandidates = classified.filter(p => p.classification === 'enemy' && !excludeSet.has(p.id));
      const clanlessList = classified.filter(p => p.classification === 'clanless');

      // Группируем enemy по боевым кланам
      const enemyGroups = {};
      enemyCandidates.forEach(p => {
        if (p.joinedClanId) {
          if (!enemyGroups[p.joinedClanId]) {
            enemyGroups[p.joinedClanId] = { clanName: p.joinedClanName, players: [] };
          }
          enemyGroups[p.joinedClanId].players.push(p);
        } else {
          if (!enemyGroups['unknown']) {
            enemyGroups['unknown'] = { clanName: 'Неизвестный', players: [] };
          }
          enemyGroups['unknown'].players.push(p);
        }
      });

      return {
        techClanId: techClan.clanId,
        techClanName: techClan.techClanName || techClan.clanName,
        inviteGroups,
        enemyGroups,
        clanlessList
      };
    }));

    console.log('Результаты обработки:', results);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(results, null, 2)
    };
  } catch (error) {
    console.error('Ошибка обработки запроса:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
