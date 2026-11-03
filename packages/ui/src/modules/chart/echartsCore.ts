import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
	AxisPointerComponent,
	GridComponent,
	MarkAreaComponent,
	MarkLineComponent,
	TooltipComponent,
	VisualMapContinuousComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Only the parts the dashboard uses, so the bundle stays small.
echarts.use([
	LineChart,
	ScatterChart,
	GridComponent,
	TooltipComponent,
	AxisPointerComponent,
	MarkAreaComponent,
	MarkLineComponent,
	VisualMapContinuousComponent,
	CanvasRenderer,
]);

export default echarts;
