// Phần chấm điểm theo luật (xác định, giải thích được) — không dùng AI
const norm = (s) => String(s || "").toLowerCase().normalize("NFC").trim();

const hasSkill = (candidateSkills, required) => {
  const r = norm(required);
  if (!r) return false;
  return candidateSkills.some((s) => {
    const c = norm(s);
    return c && (c === r || c.includes(r) || r.includes(c));
  });
};

exports.ruleScore = (profile, requirements = {}) => {
  const skills = (profile.skills || []).filter(Boolean);
  const must = requirements.mustHaveSkills || [];
  const nice = requirements.niceToHaveSkills || [];
  const minYears = Number(requirements.minYearsExperience) || 0;
  const years = Number(profile.totalYearsExperience) || 0;

  const matchedMust = must.filter((r) => hasSkill(skills, r));
  const matchedNice = nice.filter((r) => hasSkill(skills, r));

  const parts = [];
  if (must.length) parts.push({ weight: 0.6, value: matchedMust.length / must.length });
  if (nice.length) parts.push({ weight: 0.15, value: matchedNice.length / nice.length });
  if (minYears > 0) parts.push({ weight: 0.25, value: Math.min(1, years / minYears) });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = totalWeight
    ? Math.round((parts.reduce((a, p) => a + p.weight * p.value, 0) / totalWeight) * 100)
    : null;

  return {
    score,
    breakdown: {
      matchedMustHave: matchedMust,
      missingMustHave: must.filter((r) => !matchedMust.includes(r)),
      matchedNiceToHave: matchedNice,
      candidateYears: years,
      requiredYears: minYears,
    },
  };
};

exports.combine = (ruleScore, semanticScore) => {
  if (ruleScore == null) return semanticScore;
  return Math.round(0.5 * ruleScore + 0.5 * semanticScore);
};
