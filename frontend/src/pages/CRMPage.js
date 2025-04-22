import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/CRMPage.css';

function CRMPage() {
  const [activeTab, setActiveTab] = useState('offers');
  const [offers, setOffers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all data in parallel
        const [offersRes, appointmentsRes, entriesRes] = await Promise.all([
          axios.get('/api/crm/offers'),
          axios.get('/api/crm/appointments'),
          axios.get('/api/crm/entries')
        ]);
        
        setOffers(offersRes.data);
        setAppointments(appointmentsRes.data);
        setEntries(entriesRes.data);
        setError('');
      } catch (err) {
        console.error('Error fetching CRM data:', err);
        setError('Failed to load CRM data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Render different content based on the active tab
  const renderTabContent = () => {
    if (loading) {
      return <div className="loading">Loading CRM data...</div>;
    }
    
    if (error) {
      return <div className="error">{error}</div>;
    }

    switch (activeTab) {
      case 'offers':
        return (
          <div className="offers-table">
            <h3>Recent Quote Requests ({offers.length})</h3>
            {offers.length === 0 ? (
              <p>No quote requests yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Email</th>
                    <th>System Size</th>
                    <th>Quote Amount</th>
                    <th>Est. Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(offer => (
                    <tr key={offer.id}>
                      <td>{formatDate(offer.timestamp)}</td>
                      <td>{offer.userEmail}</td>
                      <td>{offer.solarPanelCount} panels</td>
                      <td>{formatCurrency(offer.estimatedCost)}</td>
                      <td>{formatCurrency(offer.estimatedSavings)}/year</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      
      case 'appointments':
        return (
          <div className="appointments-table">
            <h3>Upcoming Appointments ({appointments.length})</h3>
            {appointments.length === 0 ? (
              <p>No appointments scheduled yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Appointment Date</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Created On</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(appointment => (
                    <tr key={appointment.id}>
                      <td>{formatDate(appointment.scheduledTime)}</td>
                      <td>{appointment.userEmail}</td>
                      <td>{appointment.address || 'Not provided'}</td>
                      <td>{appointment.phoneNumber || 'Not provided'}</td>
                      <td>{formatDate(appointment.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      
      case 'interactions':
        return (
          <div className="interactions-table">
            <h3>Recent Customer Interactions ({entries.length})</h3>
            {entries.length === 0 ? (
              <p>No customer interactions recorded yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Query</th>
                    <th>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.timestamp)}</td>
                      <td>{entry.userEmail}</td>
                      <td>{entry.agentType}</td>
                      <td className="query-cell">{entry.query}</td>
                      <td className="response-cell">{entry.response}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      
      default:
        return <div>Select a tab to view data</div>;
    }
  };

  return (
    <div className="crm-page">
      <div className="crm-header">
        <h2>DemoSolar CRM Dashboard</h2>
        <p>View and manage customer interactions, quotes, and appointments</p>
      </div>
      
      <div className="crm-stats">
        <div className="stat-card">
          <h3>{offers.length}</h3>
          <p>Quote Requests</p>
        </div>
        <div className="stat-card">
          <h3>{appointments.length}</h3>
          <p>Appointments</p>
        </div>
        <div className="stat-card">
          <h3>{entries.length}</h3>
          <p>Total Interactions</p>
        </div>
      </div>
      
      <div className="tabs">
        <button 
          className={`tab-button ${activeTab === 'offers' ? 'active' : ''}`}
          onClick={() => setActiveTab('offers')}
        >
          Quotes
        </button>
        <button 
          className={`tab-button ${activeTab === 'appointments' ? 'active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          Appointments
        </button>
        <button 
          className={`tab-button ${activeTab === 'interactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('interactions')}
        >
          Interactions
        </button>
      </div>
      
      <div className="tab-content">
        {renderTabContent()}
      </div>
    </div>
  );
}

export default CRMPage; 