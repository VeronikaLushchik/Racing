import React, { useMemo } from 'react';

import { compositeClassNames } from '../../services/functions';

import { TOption } from '../../typings';

import classes from './segmentedToggle.module.scss';

interface SegmentedToggleProps<Value, Option> {
	value: Value;
	options: Option[];
	onSet: (value: Value) => void;
	disabled?: boolean;
	ariaLabel?: string;
	className?: string;
}

const SegmentedToggle = <Value extends string, Option extends TOption<Value>>(
	props: SegmentedToggleProps<Value, Option>,
): React.ReactElement => {
	const { value, options, onSet, disabled = false, ariaLabel, className } = props;

	const buttonsList = useMemo(
		() =>
			options.map(option => (
				<button
					key={option.value}
					type="button"
					className={classes.segment}
					data-is-active={option.value === value}
					aria-pressed={option.value === value}
					onClick={() => onSet(option.value)}
					disabled={disabled}
				>
					{option.label}
				</button>
			)),
		[options, value, onSet, disabled],
	);

	return (
		<div
			className={compositeClassNames(classes.container, className)}
			role="group"
			aria-label={ariaLabel}
		>
			{buttonsList}
		</div>
	);
};

export default SegmentedToggle;
