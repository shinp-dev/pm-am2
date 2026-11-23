'use strict';

const TRAINING_DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
const trainingDay = time => Math.floor((time + JST_OFFSET_MS) / TRAINING_DAY_MS);
const TRAINING_FORM_LEVELS = [1, 3, 6, 10];
const TRAINING_FORMS = ['のんびりカピバラ', '筋トレカピバラ', 'ムキムキカピバラ', 'マッスルカピバラ'];
const TRAINING_MISSIONS = [
  { name: 'ウォームアップ', description: '異なる問題を5問解く', target: 5, field: 'answered' },
  { name: '正解を積もう', description: '異なる問題で3問正解', target: 3, field: 'mastered' },
  { name: 'バランス練習', description: '2分野で正解する', target: 2, field: 'topics' },
];
const TRAINING_MISSION_XP = 10;

function trainingMissions(day) {
  return TRAINING_MISSIONS.map(mission => ({
    ...mission,
    count: Math.min(day?.[mission.field].size ?? 0, mission.target),
  }));
}

function trainingSnapshot(history, questions, now = Date.now()) {
  const answered = new Set();
  const mastered = new Set();
  const days = new Map();
  const today = trainingDay(now);

  for (const attempt of history.attempts) {
    const question = questions[attempt.id];
    if (!question) continue;
    const dayNumber = trainingDay(attempt.time);
    if (!days.has(dayNumber)) days.set(dayNumber, { answered: new Set(), mastered: new Set(), topics: new Set() });
    const day = days.get(dayNumber);
    answered.add(attempt.id);
    day.answered.add(attempt.id);
    if (attempt.choice === question.answer) {
      mastered.add(attempt.id);
      day.mastered.add(attempt.id);
      day.topics.add(question.topic);
    }
  }

  let xp = answered.size * 5 + mastered.size * 15;
  for (const day of days.values()) {
    xp += TRAINING_MISSION_XP * trainingMissions(day).filter(m => m.count === m.target).length;
  }

  let level = 1;
  let remaining = xp;
  let requirement = 60;
  while (remaining >= requirement) {
    remaining -= requirement;
    level += 1;
    requirement += 20;
  }

  let streak = 0;
  // Keep yesterday's streak visible until today's first session or local midnight.
  const lastStudyDay = days.has(today) ? today : today - 1;
  for (let day = lastStudyDay; days.has(day); day -= 1) streak += 1;

  let longest = 0;
  let run = 0;
  let previous = -Infinity;
  for (const day of [...days.keys()].sort((a, b) => a - b)) {
    run = day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  const form = TRAINING_FORM_LEVELS.findLastIndex(threshold => level >= threshold);
  const nextForm = TRAINING_FORM_LEVELS[form + 1];
  const achievements = [
    ['first', '01', 'トレーニング開始', '問題を1問解く', answered.size, 1],
    ['ten', '10', '準備運動完了', '異なる問題を10問解く', answered.size, 10],
    ['fifty', '50', '五十問突破', '異なる問題を50問解く', answered.size, 50],
    ['mastery', '25', '実力がついてきた', '異なる問題で25問正解', mastered.size, 25],
    ['streak', '3日', '三日坊主を突破', '3日連続で問題を解く', longest, 3],
    ['perfect', '5/5', 'パーフェクト', '5問チャレンジで全問正解', history.challengeBest ?? 0, 5],
    ['muscle', 'Lv.10', 'カピバラ最終形態', 'レベル10に到達する', level, 10],
    ['all', '全問', '過去問制覇', '収録された全問で正解', mastered.size, Object.keys(questions).length],
  ].map(([id, mark, name, description, count, goal]) => ({
    id, mark, name, description, count: Math.min(count, goal), goal, unlocked: count >= goal,
  }));

  return {
    xp, level, remaining, requirement, form, nextForm, name: TRAINING_FORMS[form], streak,
    missions: trainingMissions(days.get(today)), achievements,
  };
}
