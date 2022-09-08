import child_process from 'child_process';
import fs from 'fs/promises';
import { promisify } from 'node:util';
import path from 'path';

const execPromise = promisify(child_process.exec);

const roundTwo = (num) => Math.round(num * 100) / 100;

const pad = (val, length = 6) => String(val).padStart(length, ' ');

const processJSON = async function ({ resultFileName, jsonFileName }) {
  const fileData = await fs.readFile(`./${jsonFileName}`);
  const data = JSON.parse(fileData);

  console.log(`processing ${jsonFileName}`);
  console.log('\n');

  let resultText = '';

  const simulate = (
    label,
    hitsInput,
    { icd, criticalOnly = true, chance = 1 }
  ) => {
    const hits = criticalOnly
      ? hitsInput.filter(({ Result }) => Result === 'Critical')
      : hitsInput;

    const lastHitMs = hitsInput[hitsInput.length - 1]?.Time ?? 0;
    const firstHitMs = hitsInput[0]?.Time ?? 0;
    const durationMs = lastHitMs - firstHitMs;

    const simCount = chance === 1 ? 1 : 10000;

    let procs = 0;

    for (let i = 0; i < simCount; i++) {
      let lastProcMs = 0;

      for (const { Time } of hits) {
        if (Time - lastProcMs > icd * 1000 && Math.random() <= chance) {
          procs++;
          lastProcMs = Time;
        }
      }
    }

    const duration = (durationMs / 1000) * simCount;
    const rate = roundTwo((procs / duration) * 10);
    const interval = roundTwo(duration / procs);

    const simResult = `${pad(rate, 6)} procs/10 sec, ${pad(
      interval,
      5
    )} interval (${procs}/${roundTwo(duration)}): ${label}`;
    console.log(simResult);

    resultText += simResult + '\n';
  };

  for (const { Name, Type, Account, Hits } of data) {
    if (Name === 'Clone') continue;

    const skillIds = new Set();
    Hits.forEach(({ SkillId }) => skillIds.add(SkillId));
    if (skillIds.size < 2) continue;
    const skillIdsString = `${Name} skills used: ${[...skillIds].join(', ')}`;

    console.log(skillIdsString);
    resultText += skillIdsString + '\n';

    const hitsCount = Hits.length;
    const critCount = Hits.filter(({ Result }) => Result === 'Critical').length;
    const critRateString = `${Name} crit rate: ${roundTwo(
      critCount / hitsCount
    )} (${critCount}/${hitsCount})`;

    console.log(critRateString);
    resultText += critRateString + '\n';

    simulate(`torment or fire sigil (5s)`, Hits, { icd: 5 });
    simulate(`earth sigil (2s)`, Hits, { icd: 2 });
    simulate(`air sigil (3s)`, Hits, { icd: 3 });
    simulate(`burning precision (5s, 33%)`, Hits, { icd: 5, chance: 0.33 });
    simulate(`food lifesteal (2s, 66%)`, Hits, { icd: 2, chance: 0.66 });
    simulate(`vulture perma (1/4s)`, Hits, { icd: 0.25, criticalOnly: false });
    simulate(`owp perma (1s)`, Hits, { icd: 1, criticalOnly: false });
    simulate(`owp perma old (0.25s)`, Hits, { icd: 0.25, criticalOnly: false });

    resultText += '\n';
    console.log('\n');
  }

  await fs.writeFile(`./${resultFileName}`, resultText, {
    encoding: 'utf8',
    flag: 'w+',
  });
};

const evtcExport = async ({ evtcFileName, jsonFileName }) => {
  await execPromise(`./EvtcExport './${evtcFileName}' > '${jsonFileName}'`);
};

const processAll = async () => {
  const allFileNames = await fs.readdir('./');
  const evtcFiles = allFileNames
    .filter(
      (evtcFileName) =>
        evtcFileName.endsWith('.evtc') || evtcFileName.endsWith('.zevtc')
    )
    .map((evtcFileName) => {
      const baseFileName = path.parse(evtcFileName).name;
      return {
        baseFileName,
        evtcFileName,
        jsonFileName: `${baseFileName}.json`,
        resultFileName: `${baseFileName} result.txt`,
      };
    });

  const unprocessedEvtc = evtcFiles.filter(
    ({ jsonFileName }) => allFileNames.includes(jsonFileName) === false
  );

  await Promise.all(
    unprocessedEvtc.map(({ evtcFileName, jsonFileName }) =>
      evtcExport({ evtcFileName, jsonFileName })
    )
  );

  const unprocessedJSON = evtcFiles.filter(
    ({ resultFileName }) => allFileNames.includes(resultFileName) === false
  );

  for (const { resultFileName, jsonFileName } of unprocessedJSON) {
    await processJSON({ resultFileName, jsonFileName });
  }
};

processAll();
