import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './components/Menu';
import Dashboard from './components/Dashboard';
import Data from './components/Data';
import DeviceManagement from './components/DeviceManagement';
import GeofenceManagement from './components/GeofenceManagement';

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Menu />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/data" element={<Data />} />
        <Route path="/management/device" element={<DeviceManagement />} />
        <Route path="/management/geofence" element={<GeofenceManagement />} />
      </Routes>
    </Router>
  );
}

export default App;