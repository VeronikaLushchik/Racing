import React, { FC } from 'react';

import { compositeClassNames } from '../../services/functions';

import classes from './panel.module.scss';

interface PanelProps {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}

const Panel: FC<PanelProps> = props => {
	const { title, subtitle, actions, className: providedClassName, children } = props;

	return (
		<section className={compositeClassNames(classes.panel, providedClassName)}>
			<header className={classes.panel_header}>
				<div>
					<h2 className={classes.panel_title}>{title}</h2>
					{subtitle && <p className={classes.panel_subtitle}>{subtitle}</p>}
				</div>
				{actions && <div className={classes.panel_actions}>{actions}</div>}
			</header>
			<div className={classes.panel_body}>{children}</div>
		</section>
	);
};

export default Panel;
