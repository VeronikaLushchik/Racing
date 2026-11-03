/** @format */

import React, { FC } from 'react';

import Button from '~@ui/Button/Button';

import useTranslation from '~@engines/translations/useTranslation';

import classes from './source.module.scss';

interface SourceCardProps {
	title: string;
	description: string;
	isActive: boolean;
	canStart: boolean;
	onStart: () => void;
	children?: React.ReactNode;
}

const SourceCard: FC<SourceCardProps> = props => {
	const { title, description, isActive, canStart, onStart, children } = props;

	const t = useTranslation();

	return (
		<section
			className={classes.source_card}
			data-is-active={isActive}
		>
			<header className={classes.card_header}>
				<h2 className={classes.card_title}>{title}</h2>
				{isActive && <span className={classes.active_badge}>{t('source.active')}</span>}
			</header>
			<p className={classes.card_description}>{description}</p>
			<div className={classes.card_form}>{children}</div>
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
