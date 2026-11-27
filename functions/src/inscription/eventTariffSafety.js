const missingPaidMemberTariffProblem =
  'Une activité payante ne peut pas perdre tous ses tarifs et devenir gratuite implicitement. Ajoutez un tarif membre explicite (0 € si sa gratuité est voulue).';

function normalizedFunction(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/s$/, '')
    : '';
}

function tariffCategory(tariff) {
  const explicit = normalizedFunction(tariff?.category);
  if (explicit) return explicit;
  const label = normalizedFunction(tariff?.label);
  if (label.includes('encadrant')) return 'encadrant';
  if (label === 'ca' || label.includes('comite')) return 'ca';
  if (label.includes('junior')) return 'junior';
  if (label.includes('etudiant')) return 'etudiant';
  if (label.includes('non-membre') || label.includes('non membre')) return 'non-membre';
  if (label.includes('membre')) return 'membre';
  return label;
}

function pricedAboveZero(value) {
  return Number.isFinite(value) && value > 0;
}

function hasPaidTariffs(tariffs) {
  return Array.isArray(tariffs) && tariffs.some(tariff => pricedAboveZero(tariff?.price));
}

function hasLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validPrice(value) {
  return Number.isFinite(value) && value >= 0;
}

function eventTariffProblems(config, { previousTariffs, paidTariffsRemoved = false } = {}) {
  const problems = new Set();
  const tariffs = Array.isArray(config.event_tariffs) ? config.event_tariffs : [];
  if (config.event_tariffs != null && !Array.isArray(config.event_tariffs)) {
    problems.add('Recréez la liste des tarifs dans la configuration de l’événement.');
  }
  const ids = new Set();
  for (const tariff of tariffs) {
    if (!hasLabel(tariff?.id) || ids.has(tariff.id)) {
      problems.add('Chaque tarif doit avoir un identifiant unique.');
    }
    ids.add(tariff?.id);
    if (!hasLabel(tariff?.label)) problems.add('Donnez un libellé à chaque tarif.');
    if (!validPrice(tariff?.price)) {
      problems.add('Saisissez un prix valide, supérieur ou égal à zéro, pour chaque tarif.');
    }
    if (Object.values(tariff?.installment_amounts ?? {}).some(amount => !validPrice(amount))) {
      problems.add('Chaque montant de tranche doit être valide et positif ou nul.');
    }
  }

  if (config.payment_plan_enabled === true && config.price_tbd !== true) {
    const installments = Array.isArray(config.payment_installments) ? config.payment_installments : [];
    if (!installments.length
      || new Set(installments.map(item => item?.id)).size !== installments.length
      || installments.some(item => !hasLabel(item?.id) || !hasLabel(item?.label))) {
      problems.add('Définissez des tranches distinctes avec un nom pour chacune.');
    }
    if (!tariffs.length) problems.add('Ajoutez un tarif membre avant d’activer le paiement en tranches.');
    for (const tariff of tariffs) {
      if (!hasLabel(tariff?.label)) continue;
      const amounts = installments.map(item => tariff.installment_amounts?.[item?.id]);
      if (amounts.some(amount => !validPrice(amount))) {
        problems.add(`Complétez chaque montant de tranche du tarif « ${tariff.label} » dans Tarifs (0 € si aucun montant n’est dû).`);
      } else if (Math.abs(amounts.reduce((sum, amount) => sum + amount, 0) - tariff.price) > 0.005) {
        problems.add(`La somme des tranches du tarif « ${tariff.label} » doit correspondre à son prix.`);
      }
    }
  }

  if (tariffs.length && !tariffs.some(tariff =>
    tariff?.is_guest_tariff !== true && tariffCategory(tariff) === 'membre')) {
    problems.add('Ajoutez un tarif « Membre » de catégorie « membre » pour les membres ordinaires. Décochez « Invités uniquement » pour ce tarif.');
  }
  if (config.price_tbd !== true) {
    const explicitLegacyPrice = pricedAboveZero(config.prix_membre);
    if (!tariffs.length && !explicitLegacyPrice
      && (config.payment_required === true
        || (config.payment_required !== false && (paidTariffsRemoved || hasPaidTariffs(previousTariffs))))) {
      problems.add(missingPaidMemberTariffProblem);
    }
    const paid = config.payment_required !== false && (hasPaidTariffs(tariffs) || explicitLegacyPrice);
    if (config.allow_guests === true && paid && !tariffs.some(tariff => tariff?.is_guest_tariff === true)) {
      problems.add('Les invités sont autorisés mais leur tarif manque. Ajoutez un tarif « Invités uniquement » (0 € si leur gratuité est voulue).');
    }
  }
  return [...problems];
}

module.exports = {
  eventTariffProblems,
  missingPaidMemberTariffProblem,
  normalizedFunction,
  tariffCategory,
};
