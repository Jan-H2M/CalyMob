#!/usr/bin/env node

/**
 * Test Script: Verify Communication Schedule Logic
 *
 * Tests the timezone handling and schedule matching logic
 * without needing to deploy to production
 */

// Simulate the getCurrentBrusselsTime function
function getCurrentBrusselsTime() {
  const now = new Date();

  const brusselsTimeStr = now.toLocaleString('en-US', {
    timeZone: 'Europe/Brussels',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const brusselsDate = new Date(brusselsTimeStr);

  return {
    hours: brusselsDate.getHours(),
    minutes: brusselsDate.getMinutes(),
    dayOfWeek: brusselsDate.getDay(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    isoString: brusselsDate.toISOString()
  };
}

// Simulate shouldRunToday
function shouldRunToday(job) {
  const { dayOfWeek } = getCurrentBrusselsTime();
  return job.daysOfWeek.includes(dayOfWeek);
}

// Simulate shouldRunNow
function shouldRunNow(job) {
  const { hours: currentHours, minutes: currentMinutes } = getCurrentBrusselsTime();

  const [jobHours, jobMinutes] = job.timeOfDay.split(':').map(Number);

  const currentTimeMinutes = currentHours * 60 + currentMinutes;
  const jobTimeMinutes = jobHours * 60 + jobMinutes;

  const tolerance = 15;
  const diff = Math.abs(currentTimeMinutes - jobTimeMinutes);

  return diff <= tolerance;
}

// Simulate shouldExecuteJob
function shouldExecuteJob(job) {
  return shouldRunToday(job) && shouldRunNow(job);
}

// Helper to format day name
function getDayName(day) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[day];
}

// Test jobs from your configuration
const jobs = [
  {
    id: 'pending-demands-reminder',
    name: 'Rappel demandes en attente',
    daysOfWeek: [4], // Thursday
    timeOfDay: '09:00'
  },
  {
    id: 'accounting-codes-daily',
    name: 'Nouveau jobcodes comptables',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Every day
    timeOfDay: '16:00'
  }
];

// Run tests
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📧 Communication Schedule Logic Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Display current time
const now = new Date();
const brusselsTime = getCurrentBrusselsTime();

console.log('⏰ CURRENT TIME:\n');
console.log(`   Server Time (UTC):  ${now.toISOString()}`);
console.log(`   Brussels Time:      ${now.toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', hour12: false })}`);
console.log(`   Day of Week:        ${brusselsTime.dayOfWeek} (${getDayName(brusselsTime.dayOfWeek)})`);
console.log(`   Time (HH:MM):       ${String(brusselsTime.hours).padStart(2, '0')}:${String(brusselsTime.minutes).padStart(2, '0')}`);
console.log();

// Test each job
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📋 JOB SCHEDULE TESTS:\n');

jobs.forEach((job, index) => {
  console.log(`${index + 1}. ${job.name}`);
  console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const runToday = shouldRunToday(job);
  const runNow = shouldRunNow(job);
  const willExecute = shouldExecuteJob(job);

  console.log(`   📅 Scheduled Days:      ${job.daysOfWeek.map(d => getDayName(d)).join(', ')}`);
  console.log(`   ⏰ Scheduled Time:      ${job.timeOfDay}`);
  console.log();
  console.log(`   ✓ Should run today?     ${runToday ? '✅ YES' : '❌ NO'}`);
  console.log(`   ✓ Should run now?       ${runNow ? '✅ YES' : '❌ NO'}`);
  console.log(`   ✓ Will execute?         ${willExecute ? '✅ YES - JOB WILL RUN!' : '❌ NO - Job will be skipped'}`);

  if (!willExecute) {
    if (!runToday) {
      console.log(`   💡 Reason:              Wrong day (need: ${job.daysOfWeek.join(',')}, got: ${brusselsTime.dayOfWeek})`);
    } else if (!runNow) {
      const jobTimeMinutes = job.timeOfDay.split(':').map(Number);
      const jobTime = `${String(jobTimeMinutes[0]).padStart(2, '0')}:${String(jobTimeMinutes[1]).padStart(2, '0')}`;
      const currentTime = `${String(brusselsTime.hours).padStart(2, '0')}:${String(brusselsTime.minutes).padStart(2, '0')}`;
      console.log(`   💡 Reason:              Wrong time (need: ${jobTime}, got: ${currentTime}, tolerance: ±15 min)`);
    }
  }

  console.log();
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 NEXT EXECUTION TIMES:\n');

jobs.forEach((job) => {
  console.log(`${job.name}:`);

  // Find next execution time
  const [jobHours, jobMinutes] = job.timeOfDay.split(':').map(Number);
  const currentDay = brusselsTime.dayOfWeek;

  // Find next matching day
  let daysUntilNext = null;
  for (let i = 0; i < 7; i++) {
    const futureDay = (currentDay + i) % 7;
    if (job.daysOfWeek.includes(futureDay)) {
      daysUntilNext = i;
      break;
    }
  }

  if (daysUntilNext !== null) {
    if (daysUntilNext === 0) {
      const currentMinutes = brusselsTime.hours * 60 + brusselsTime.minutes;
      const jobMinutesTotal = jobHours * 60 + jobMinutes;

      if (jobMinutesTotal > currentMinutes + 15) {
        console.log(`   ⏰ Today at ${job.timeOfDay} (in ${Math.floor((jobMinutesTotal - currentMinutes) / 60)}h ${(jobMinutesTotal - currentMinutes) % 60}m)`);
      } else {
        daysUntilNext = 7; // Next week
      }
    }

    if (daysUntilNext > 0) {
      const nextDay = getDayName((currentDay + daysUntilNext) % 7);
      console.log(`   ⏰ ${nextDay} at ${job.timeOfDay} (in ${daysUntilNext} day${daysUntilNext > 1 ? 's' : ''})`);
    }
  }

  console.log();
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('✅ Test completed!\n');
console.log('💡 TIP: Run this script multiple times to see how the schedule');
console.log('         logic responds at different times of day.\n');
console.log('📝 NOTE: Jobs execute every 15 minutes and check if they should run');
console.log('         based on the configured schedule (±15 minute tolerance).\n');
