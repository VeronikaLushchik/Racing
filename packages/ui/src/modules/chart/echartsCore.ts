import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Only the parts the dashboard uses, so the bundle stays small.
echarts.use([LineChart, GridComponent, TooltipComponent, AxisPointerComponent, CanvasRenderer]);

export default echarts;
