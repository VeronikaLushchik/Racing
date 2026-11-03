/** @format */

import React, { FC } from 'react';

import { compositeClassNames } from '../../services/functions';

import classes from './button.module.scss';

interface OwnProps {
	variant?: 'primary' | 'secondary' | 'system' | 'text';
	size?: 'lg' | 'md' | 'sm' | 'xs';
	disabled?: boolean;
	className?: string;
	innerRef?: React.Ref<HTMLButtonElement>;
	type?: 'button' | 'submit' | 'reset';
}

type NativeElementProps = Omit<
	React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>,
	keyof OwnProps | 'ref'
>;

type ButtonProps = OwnProps & NativeElementProps;

const Button: FC<ButtonProps> = props => {
	const {
		variant = 'primary',
		size = 'md',
		children,
		disabled = false,
		className: providedClassName,
		innerRef,
		type = 'button',
		...buttonProps
	} = props;

	return (
		<button
			{...buttonProps}
			ref={innerRef}
			type={type}
			className={compositeClassNames(classes.button, providedClassName)}
			data-button-size={size}
			data-button-type={variant}
			disabled={disabled}
		>
			{children && <span>{children}</span>}
		</button>
	);
};

export default React.forwardRef<HTMLButtonElement, Omit<ButtonProps, 'innerRef'>>((props, ref) => (
	<Button
		{...props}
		innerRef={ref}
	/>
));
