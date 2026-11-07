<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([LineChart,PieChart,GridComponent,TooltipComponent,CanvasRenderer]);
import type { AudioAnalysis } from "../../shared/types/audio";
const props=defineProps<{ analysis:AudioAnalysis }>(); const speaking=ref<HTMLElement>(); const energy=ref<HTMLElement>();
let speakingChart:echarts.ECharts|undefined, energyChart:echarts.ECharts|undefined;
function render(){
  const speakers=props.analysis.speaker_metrics ?? [];
  speakingChart?.setOption({tooltip:{trigger:"item"},series:[{type:"pie",radius:["45%","72%"],data:speakers.map(x=>({name:`${x.speaker_id} (${x.inferred_role})`,value:x.total_speaking_seconds}))}]});
  const timeline=props.analysis.recording_metrics?.energy_timeline;
  const points=Array.isArray(timeline) ? timeline.filter((x):x is {time_seconds:number;rms_dbfs:number|null}=>typeof x==="object" && x!==null && "time_seconds" in x) : [];
  energyChart?.setOption({grid:{left:48,right:16,top:24,bottom:36},tooltip:{trigger:"axis"},xAxis:{type:"value",name:"seconds"},yAxis:{type:"value",name:"dBFS"},series:[{type:"line",showSymbol:false,smooth:true,data:points.map(x=>[x.time_seconds,x.rms_dbfs])}]});
}
onMounted(()=>{ if(speaking.value)speakingChart=echarts.init(speaking.value); if(energy.value)energyChart=echarts.init(energy.value); render(); });
watch(()=>props.analysis,render,{deep:true}); onBeforeUnmount(()=>{speakingChart?.dispose();energyChart?.dispose();});
</script>
<template><div class="grid gap-4 lg:grid-cols-2"><div><h3 class="mb-2 text-sm font-bold">Speaking-time distribution</h3><div ref="speaking" class="h-64" /></div><div><h3 class="mb-2 text-sm font-bold">Energy over time</h3><div ref="energy" class="h-64" /></div></div></template>
