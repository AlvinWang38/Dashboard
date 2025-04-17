import { Link } from 'react-router-dom';
import { useState } from 'react';

const Menu = () => {
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  const menuStyle = {
    width: '200px',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    backgroundColor: '#f8f9fa',
    padding: '20px',
    borderRight: '1px solid #ddd',
    textAlign: 'left',
  };

  const linkStyle = {
    display: 'block',
    padding: '10px 0',
    color: '#007bff',
    textDecoration: 'none',
    fontWeight: 'bold',
  };

  const subLinkStyle = {
    ...linkStyle,
    paddingLeft: '20px',
    fontWeight: 'normal',
  };

  const titleStyle = {
    marginBottom: '20px',
    fontSize: '1.5em',
    fontWeight: 'bold',
    lineHeight: '1.2',
    textAlign: 'center',
  };

  const toggleStyle = {
    ...linkStyle,
    cursor: 'pointer',
  };

  return (
    <div style={menuStyle}>
      <div style={titleStyle}>
        LEO-L50<br />Dashboard
      </div>
      <Link to="/" style={linkStyle}>Dashboard</Link>
      <Link to="/data" style={linkStyle}>Data</Link>
      <div style={toggleStyle} onClick={() => setIsManagementOpen(!isManagementOpen)}>
        Management {isManagementOpen ? '▲' : '▼'}
      </div>
      {isManagementOpen && (
        <div>
          <Link to="/management/device" style={subLinkStyle}>Device</Link>
          <Link to="/management/geofence" style={subLinkStyle}>Geofence</Link>
        </div>
      )}
    </div>
  );
};

export default Menu;