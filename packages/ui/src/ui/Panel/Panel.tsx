/** @format */

import React, { FC, ReactNode } from 'react';

import { compositeClassNames } from 'src/services/functions';

import classes from './panel.module.scss';

interface PanelProps {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	className?: string;
	children: ReactNode;
}

const Panel: FC<PanelProps> = props => {
	const { title, subtitle, actions, className, children } = props;

	return (
		<section className={compositeClassNames(classes.root, className)}>
			<header className={classes.header}>
				<div>
					<h2 className={classes.title}>{title}</h2>
					{subtitle && <p className={classes.subtitle}>{subtitle}</p>}
				</div>
				{actions && <div className={classes.actions}>{actions}</div>}
			</header>
			<div className={classes.body}>{children}</div>
		</section>
	);
};

export default Panel;
