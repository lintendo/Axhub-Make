/**
 * @name 远程控制机器人可视化大屏
 * 
 * 参考资料：
 * - /src/pages/robot-control-dashboard/spec.md
 */
import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Battery, Signal, Thermometer, Wind, Bot, Video, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Hand, Radio, LogIn } from 'lucide-react';
import './style.css';

// 模拟数据
const MOCK_LOGS = [
  { id: 1, time: '14:32:15', level: 'info', message: '任务 "巡检A区" 开始' },
  { id: 2, time: '14:32:45', level: 'info', message: '移动至坐标 (12, 45)' },
  { id: 3, time: '14:33:10', level: 'warn', message: '路径规划临时受阻，重新计算' },
  { id: 4, time: '14:33:55', level: 'info', message: '机械臂抓取目标 "样本01"' },
  { id: 5, time: '14:34:20', level: 'error', message: '电机 #3 温度过高 (85°C)' },
  { id: 6, time: '14:35:00', level: 'info', message: '任务 "巡检A区" 完成' },
];

const Component = () => {
  const [robotStatus, setRobotStatus] = useState({
    battery: 76,
    signal: 92,
    motorTemp: 58,
    speed: 1.2,
  });
  const [envData, setEnvData] = useState({
    temperature: 24,
    humidity: 65,
    airQuality: 88,
  });
  const [logs, setLogs] = useState(MOCK_LOGS);
  const envChartRef = useRef(null);

  // 模拟数据更新
  useEffect(() => {
    const interval = setInterval(() => {
      setRobotStatus(prev => ({
        battery: Math.max(0, prev.battery - 1),
        signal: Math.min(100, Math.max(0, prev.signal + (Math.random() - 0.5) * 5)),
        motorTemp: Math.min(100, Math.max(20, prev.motorTemp + (Math.random() - 0.4) * 2)),
        speed: Math.max(0, prev.speed + (Math.random() - 0.5) * 0.2),
      }));
      setEnvData(prev => ({
        temperature: prev.temperature + (Math.random() - 0.5) * 0.5,
        humidity: Math.min(100, Math.max(0, prev.humidity + (Math.random() - 0.5) * 2)),
        airQuality: Math.min(100, Math.max(0, prev.airQuality + (Math.random() - 0.5) * 3)),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 环境数据图表
  useEffect(() => {
    if (!envChartRef.current) return;
    const chart = echarts.init(envChartRef.current);
    const option = {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['温度', '湿度', '空气质量'],
        textStyle: { color: '#94a3b8' },
        top: 10,
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['-60s', '-45s', '-30s', '-15s', 'now'],
        axisLine: { lineStyle: { color: '#475569' } },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        splitLine: { lineStyle: { color: '#334155' } },
      },
      series: [
        { name: '温度', type: 'line', smooth: true, data: [23, 23.5, 24, 24.2, envData.temperature.toFixed(1)], areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(56, 189, 248, 0.3)' }, { offset: 1, color: 'rgba(56, 189, 248, 0)' }]) }, itemStyle: { color: '#38bdf8' } },
        { name: '湿度', type: 'line', smooth: true, data: [66, 65.5, 65, 64.8, envData.humidity.toFixed(1)], areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(74, 222, 128, 0.3)' }, { offset: 1, color: 'rgba(74, 222, 128, 0)' }]) }, itemStyle: { color: '#4ade80' } },
        { name: '空气质量', type: 'line', smooth: true, data: [85, 86, 88, 87, envData.airQuality.toFixed(1)], areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(251, 191, 36, 0.3)' }, { offset: 1, color: 'rgba(251, 191, 36, 0)' }]) }, itemStyle: { color: '#facc15' } },
      ]
    };
    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [envData]);

  const StatusCard = ({ icon, title, value, unit, color }) => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex items-center gap-4">
      <div className={`p-2 rounded-full ${color}`}>{icon}</div>
      <div>
        <div className="text-sm text-slate-400">{title}</div>
        <div className="text-xl font-bold text-white">{value}<span className="text-xs text-slate-400 ml-1">{unit}</span></div>
      </div>
    </div>
  );

  const ControlButton = ({ icon, label }) => (
    <button className="bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg p-4 flex flex-col items-center justify-center transition-colors">
      {icon}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 flex flex-col gap-4 font-sans">
      <header className="flex items-center justify-between pb-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Bot className="w-8 h-8 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">机器人远程控制中心</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-green-400">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>连接正常</span>
          </div>
          <div className="text-slate-400">{new Date().toLocaleString()}</div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Column */}
        <div className="col-span-3 flex flex-col gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h2 className="text-lg font-semibold mb-4 text-slate-300">状态监控</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatusCard icon={<Battery className="w-5 h-5 text-white"/>} title="电量" value={`${robotStatus.battery.toFixed(0)}%`} color={robotStatus.battery > 20 ? 'bg-green-500/80' : 'bg-red-500/80'} />
              <StatusCard icon={<Signal className="w-5 h-5 text-white"/>} title="信号" value={`${robotStatus.signal.toFixed(0)}%`} color="bg-blue-500/80" />
              <StatusCard icon={<Thermometer className="w-5 h-5 text-white"/>} title="电机温度" value={`${robotStatus.motorTemp.toFixed(1)}°C`} unit="" color={robotStatus.motorTemp < 80 ? 'bg-sky-500/80' : 'bg-orange-500/80'} />
              <StatusCard icon={<Wind className="w-5 h-5 text-white"/>} title="速度" value={robotStatus.speed.toFixed(2)} unit="m/s" color="bg-indigo-500/80" />
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h2 className="text-lg font-semibold mb-4 text-slate-300">手动控制</h2>
            <div className="grid grid-cols-3 gap-2">
              <div/> <ControlButton icon={<ChevronUp size={20}/>} label="前进"/> <div/>
              <ControlButton icon={<ChevronLeft size={20}/>} label="左转"/> <ControlButton icon={<Hand size={20}/>} label="抓取"/> <ControlButton icon={<ChevronRight size={20}/>} label="右转"/>
              <div/> <ControlButton icon={<ChevronDown size={20}/>} label="后退"/> <div/>
            </div>
          </div>
        </div>

        {/* Center Column */}
        <div className="col-span-6 bg-black rounded-lg border border-slate-700 flex items-center justify-center relative overflow-hidden">
          <img src="https://picsum.photos/seed/robot/1200/800" alt="Robot Camera Feed" className="w-full h-full object-cover" />
          <div className="absolute top-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm flex items-center gap-2">
            <Video className="w-4 h-4 text-red-500" />
            <span>CAM 01 - Live</span>
          </div>
          <div className="absolute bottom-4 right-4 w-1/3 h-1/3 bg-slate-800/80 rounded-lg border border-slate-600 backdrop-blur-sm">
             <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">3D姿态 (占位)</div>
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-3 flex flex-col gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex-1 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-slate-300">环境感知</h2>
            <div ref={envChartRef} className="flex-1 w-full h-full" />
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex-1 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-slate-300">任务日志</h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {logs.slice().reverse().map(log => (
                <div key={log.id} className={`text-xs flex items-start ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                  'text-slate-400'
                }`}>
                  <span className="font-mono mr-2">[{log.time}]</span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Component;
