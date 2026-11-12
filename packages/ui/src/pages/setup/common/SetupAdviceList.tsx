import React, { FC } from 'react';

import useTranslation from '~@engines/translations/useTranslation';
import {
	SETUP_FIELD_SPECS,
	TSetupAdvice,
	TSetupChange,
} from '~@engines/racingMath/setupAdvisorModel';

import { FIELD_LABEL } from './setupConstants';

import classes from './setup.module.scss';

type TTranslate = ReturnType<typeof useTranslation>;

const formatNumber = (value: number, step: number): string =>
	value.toFixed(Math.max(0, -Math.floor(Math.log10(step))));

export const changeText = (t: TTranslate, change: TSetupChange): string => {
	const label = FIELD_LABEL[change.field];
	const spec = SETUP_FIELD_SPECS[change.field];
	const name = `${t(`setup.field.${label.row}` as TTranslationKey)}${
		label.axle ? ` (${t(`setup.${label.axle}` as TTranslationKey)})` : ''
	}`;
	const unit = spec.unit ? ` ${spec.unit}` : '';
	if (change.field === 'brakeBalance') {
		const brakes = t('setup.brakeBalanceName');
		const where = t(change.direction > 0 ? 'setup.towardRear' : 'setup.towardFront');
		return change.from !== null && change.to !== null
			? `${brakes}: ${change.from} → ${change.to} (${where})`
			: `${brakes}: ${where}`;
	}
	if (change.from !== null && change.to !== null) {
		return `${name}: ${formatNumber(change.from, spec.step)} → ${formatNumber(
			change.to,
			spec.step,
		)}${unit}`;
	}
	return `${name}: ${t(change.direction > 0 ? 'setup.raise' : 'setup.lower')} ${formatNumber(
		spec.click,
		spec.step,
	)}${unit}`;
};

export const evidenceText = (t: TTranslate, advice: TSetupAdvice): string => {
	switch (advice.metric) {
		case 'ratio':
			return t(
				advice.value >= 1 ? 'setup.evidence.moreSteer' : 'setup.evidence.lessSteer',
				Math.round(Math.abs(advice.value - 1) * 100),
			);
		case 'counterSteer':
			return t('setup.evidence.counterSteer', Math.round(advice.value * 100));
		case 'share':
			return t('setup.evidence.share', Math.round(advice.value * 100));
		case 'celsius':
		default:
			return t('setup.evidence.celsius', advice.value.toFixed(1));
	}
};

interface SetupAdviceListProps {
	advice: TSetupAdvice[];
}

/** Setup findings, strongest first: what the car does, the evidence and what to change. */
const SetupAdviceList: FC<SetupAdviceListProps> = props => {
	const { advice } = props;

	const t = useTranslation();

	return (
		<ul className={classes.advice_list}>
			{advice.map(item => (
				<li
					key={item.id}
					className={classes.advice}
					data-confidence={item.confidence}
				>
					<div className={classes.advice_header}>
						<h3 className={classes.advice_title}>
							{t(`setup.advice.${item.id}.title` as TTranslationKey)}
						</h3>
						<span className={classes.badge}>
							{t(`setup.confidence.${item.confidence}` as TTranslationKey)}
						</span>
					</div>
					<p className={classes.text}>
						{t(`setup.advice.${item.id}.why` as TTranslationKey)}{' '}
						<span className={classes.muted}>{evidenceText(t, item)}</span>
					</p>
					{item.changes.map((change, index) => (
						<p
							key={change.field}
							className={classes.change}
							data-is-alternative={index > 0}
						>
							{index === 0 ? '→ ' : `${t('setup.or')} `}
							{changeText(t, change)}
						</p>
					))}
				</li>
			))}
		</ul>
	);
};

export default SetupAdviceList;
