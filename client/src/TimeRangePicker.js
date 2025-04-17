import React, { useState } from 'react';
import Datetime from 'react-datetime';
import moment from 'moment';
import 'react-datetime/css/react-datetime.css';

const TimeRangePicker = ({ onTimeRangeChange, initialRange = '1h' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState(initialRange);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);

  const relativeOptions = [
    { label: 'Past 1 Minute', value: '1m' },
    { label: 'Past 5 Minutes', value: '5m' },
    { label: 'Past 10 Minutes', value: '10m' },
    { label: 'Past 1 Hour', value: '1h' },
    { label: 'Past 6 Hours', value: '6h' },
    { label: 'Past 24 Hours', value: '24h' },
    { label: 'Past 7 Days', value: '7d' },
  ];

  const handleRelativeChange = (value) => {
    setSelectedRange(value);
    setIsOpen(false);
    onTimeRangeChange({ type: 'relative', value });
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setIsOpen(false);
      // Currently disabled due to backend not supporting custom range
      // onTimeRangeChange({
      //   type: 'custom',
      //   from: customFrom.toISOString(),
      //   to: customTo.toISOString(),
      // });
      console.log('Custom range selected:', {
        from: customFrom.toISOString(),
        to: customTo.toISOString(),
      });
    }
  };

  const containerStyle = {
    position: 'relative',
    display: 'inline-block',
  };

  const buttonStyle = {
    padding: '8px 12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    padding: '10px',
    zIndex: 1000,
    width: '300px',
  };

  const optionStyle = {
    padding: '5px 10px',
    cursor: 'pointer',
    backgroundColor: '#fff',
    borderRadius: '4px',
    margin: '2px 0',
  };

  const customSectionStyle = {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #ddd',
  };

  return (
    <div style={containerStyle}>
      <button style={buttonStyle} onClick={() => setIsOpen(!isOpen)}>
        Time Range: {relativeOptions.find(opt => opt.value === selectedRange)?.label || 'Custom'} ▼
      </button>
      {isOpen && (
        <div style={dropdownStyle}>
          <div>
            {relativeOptions.map((option) => (
              <div
                key={option.value}
                style={{
                  ...optionStyle,
                  backgroundColor: selectedRange === option.value ? '#e6f0ff' : '#fff',
                }}
                onClick={() => handleRelativeChange(option.value)}
              >
                {option.label}
              </div>
            ))}
          </div>
          <div style={customSectionStyle}>
            <div>
              <span>From: </span>
              <Datetime
                value={customFrom}
                onChange={(date) => setCustomFrom(moment(date))}
                dateFormat="YYYY-MM-DD"
                timeFormat="HH:mm:ss"
                inputProps={{ style: { width: '140px', padding: '5px' } }}
              />
            </div>
            <div style={{ marginTop: '5px' }}>
              <span>To: </span>
              <Datetime
                value={customTo}
                onChange={(date) => setCustomTo(moment(date))}
                dateFormat="YYYY-MM-DD"
                timeFormat="HH:mm:ss"
                inputProps={{ style: { width: '140px', padding: '5px' } }}
              />
            </div>
            <button
              onClick={handleCustomApply}
              disabled={!customFrom || !customTo}
              style={{ ...buttonStyle, marginTop: '10px', width: '100%' }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRangePicker;