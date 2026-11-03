/** @format */

import React, { FC, ReactNode } from 'react';

import Button from '~@ui/Button/Button';

import useTranslation from '~@engines/translations/useTranslation';

import classes from './source.module.scss';

interface SourceCardProps {
	title: string;
	description: string;
	isActive: boolean;
	canStart: boolean;
	onStart: () => void;
	children?: ReactNode;
}

const SourceCard: FC<SourceCardProps> = props => {
	const { title, description, isActive, canStart, onStart, children } = props;

	const t = useTranslation();

	return (
		<section
			className={classes.card}
			data-active={isActive || undefined}
		>
			<header className={classes.cardHeader}>
				<h2>{title}</h2>
				{isActive && <span className={classes.badge}>{t('source.active')}</span>}
			</header>
			<p className={classes.description}>{description}</p>
			<div className={classes.form}>{children}</div>
			<Button
				variant="primary"
				disabled={!canStart}
				onClick={onStart}
			>
				{t('common.start')}
			</Button>
		</section>
	);
};

export default SourceCard;
