import React, { FC } from 'react';

import { compositeClassNames } from '../../services/functions';

import classes from './pageSection.module.scss';

interface PageSectionProps {
	title: string;
	hint?: string;
	className?: string;
	children: React.ReactNode;
}

/** A titled block of a page; pages stack sections instead of hiding them in tabs. */
const PageSection: FC<PageSectionProps> = props => {
	const { title, hint, className: providedClassName, children } = props;

	return (
		<section className={compositeClassNames(classes.page_section, providedClassName)}>
			<header className={classes.section_header}>
				<h2 className={classes.section_title}>{title}</h2>
				{hint && <p className={classes.section_hint}>{hint}</p>}
			</header>
			{children}
		</section>
	);
};

export default PageSection;
