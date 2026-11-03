/** @format */

import React, { FC, ReactNode } from 'react';

import classes from './field.module.scss';

interface FieldProps {
	label: string;
	hint?: string;
	children: ReactNode;
}

const Field: FC<FieldProps> = props => {
	const { label, hint, children } = props;

	return (
		<label className={classes.root}>
			<span className={classes.label}>{label}</span>
			{children}
			{hint && <span className={classes.hint}>{hint}</span>}
		</label>
	);
};

export default Field;
