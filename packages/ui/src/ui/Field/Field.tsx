import React, { FC } from 'react';

import { compositeClassNames } from '../../services/functions';

import classes from './field.module.scss';

interface FieldProps {
	label: string;
	hint?: string;
	className?: string;
	children: React.ReactNode;
}

const Field: FC<FieldProps> = props => {
	const { label, hint, className: providedClassName, children } = props;

	return (
		<label className={compositeClassNames(classes.field, providedClassName)}>
			<span className={classes.field_label}>{label}</span>
			{children}
			{hint && <span className={classes.field_hint}>{hint}</span>}
		</label>
	);
};

export default Field;
