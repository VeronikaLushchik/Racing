/** @format */

import React, { ButtonHTMLAttributes, forwardRef } from 'react';

import { compositeClassNames } from 'src/services/functions';

import classes from './button.module.scss';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost';
	size?: 'sm' | 'md';
	isActive?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
	const {
		variant = 'secondary',
		size = 'md',
		isActive = false,
		className,
		type = 'button',
		...rest
	} = props;

	return (
		<button
			ref={ref}
			type={type}
			className={compositeClassNames(classes.root, className)}
			data-button-variant={variant}
			data-button-size={size}
			data-active={isActive || undefined}
			{...rest}
		/>
	);
});

Button.displayName = 'Button';

export default Button;
