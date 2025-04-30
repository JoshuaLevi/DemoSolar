import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/CRMPage.css';
import AppointmentCalendar from '../components/Calendar';

function CRMPage() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [offers, setOffers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Add specific error states for each data type
  const [dataErrors, setDataErrors] = useState({
    offers: '',
    appointments: '',
    entries: '',
    assessments: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Helper function to safely fetch data with proper error handling
      const safelyFetchData = async (url, label) => {
        try {
          console.log(`Fetching ${label} data from ${url}...`);
          const response = await axios.get(url);
          console.log(`${label} data received:`, response.data);
          
          // Ensure we handle empty results correctly
          if (!response.data) {
            console.warn(`No ${label} data received (null/undefined)`);
            return [];
          }
          
          // Ensure we always return an array
          if (!Array.isArray(response.data)) {
            console.warn(`${label} data is not an array, received:`, typeof response.data);
            return [];
          }
          
          return response.data;
        } catch (err) {
          console.error(`Error fetching ${label} data:`, err);
          // Update specific error
          setDataErrors(prev => ({
            ...prev,
            [label.toLowerCase()]: `Failed to load ${label} data: ${err.message}`
          }));
          return [];
        }
      };
      
      try {
        // Fetch each data type independently to prevent one failure from affecting others
        const offersData = await safelyFetchData('/api/crm/offers', 'Offers');
        const appointmentsData = await safelyFetchData('/api/crm/appointments', 'Appointments');
        const entriesData = await safelyFetchData('/api/crm/entries', 'Entries');
        const assessmentsData = await safelyFetchData('/api/crm/assessments', 'Assessments');
        
        // Set data (guaranteed to be arrays from safelyFetchData)
        setOffers(offersData);
        setAppointments(appointmentsData);
        setEntries(entriesData);
        setAssessments(assessmentsData);
        
        // Clear general error if all went well
        setError('');
      } catch (err) {
        console.error('Error in overall data fetch process:', err);
        setError('Failed to load dashboard data. Please try refreshing the page.');
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
    // Format as Euro for NL context
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR'
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
      case 'calendar':
        return (
          <div className="calendar-view">
            <h3>Appointment Calendar</h3>
            <p className="calendar-instructions">
              View, add, and manage appointments. Click on a time slot to create a new appointment
              or click on an existing appointment to view details.
            </p>
            <AppointmentCalendar aiAppointments={appointments} />
          </div>
        );
      
      case 'offers':
        // Explicitly check if offers is an array before mapping
        const hasOffers = Array.isArray(offers) && offers.length > 0;
        return (
          <div className="offers-table">
            <h3>Recent Quote Requests ({hasOffers ? offers.length : 0})</h3>
            {dataErrors.offers && <div className="error-banner">{dataErrors.offers}</div>}
            {!hasOffers ? (
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
      
      case 'assessments':
        const hasAssessments = Array.isArray(assessments) && assessments.length > 0;
        return (
          <div className="assessments-table">
            <h3>Recent Assessments ({hasAssessments ? assessments.length : 0})</h3>
            {dataErrors.assessments && <div className="error-banner">{dataErrors.assessments}</div>}
            {!hasAssessments ? (
              <p>No assessments recorded yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Energy Usage</th>
                    <th>Status</th>
                    <th>Conv. ID</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(assessment => (
                    <tr key={assessment.id}>
                      <td>{formatDate(assessment.timestamp)}</td>
                      <td>{assessment.userEmail || 'anonymous'}</td>
                      <td>{assessment.address || 'Not provided'}</td>
                      <td>{assessment.energyUsage || 'Not provided'}</td>
                      <td>{assessment.status || '-'}</td>
                      <td>{assessment.conversationId || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      
      case 'appointments':
         const hasAppointments = Array.isArray(appointments) && appointments.length > 0;
        return (
          <div className="appointments-table">
            <h3>Upcoming Appointments ({hasAppointments ? appointments.length : 0})</h3>
            {dataErrors.appointments && <div className="error-banner">{dataErrors.appointments}</div>}
            {!hasAppointments ? (
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
        const hasEntries = Array.isArray(entries) && entries.length > 0;
        return (
          <div className="interactions-table">
            <h3>Recent Customer Interactions ({hasEntries ? entries.length : 0})</h3>
            {dataErrors.entries && <div className="error-banner">{dataErrors.entries}</div>}
            {!hasEntries ? (
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
        {/* Ensure length is checked safely */}
        <div className="stat-card">
          <h3>{Array.isArray(offers) ? offers.length : 0}</h3>
          <p>Quote Requests</p>
        </div>
        <div className="stat-card">
          <h3>{Array.isArray(appointments) ? appointments.length : 0}</h3>
          <p>Appointments</p>
        </div>
        <div className="stat-card">
          <h3>{Array.isArray(entries) ? entries.length : 0}</h3>
          <p>Total Interactions</p>
        </div>
        <div className="stat-card">
          <h3>{Array.isArray(assessments) ? assessments.length : 0}</h3>
          <p>Assessments</p>
        </div>
      </div>
      
      <div className="tabs">
        {/* Tab buttons */}
        <button 
          onClick={() => setActiveTab('calendar')} 
          className={activeTab === 'calendar' ? 'active' : ''}
        >
          Calendar
        </button>
        <button 
          onClick={() => setActiveTab('offers')} 
          className={activeTab === 'offers' ? 'active' : ''}
        >
          Quote Requests
        </button>
        <button 
          onClick={() => setActiveTab('assessments')} 
          className={activeTab === 'assessments' ? 'active' : ''}
        >
          Assessments
        </button>
        <button 
          onClick={() => setActiveTab('appointments')} 
          className={activeTab === 'appointments' ? 'active' : ''}
        >
          Appointments
        </button>
        <button 
          onClick={() => setActiveTab('interactions')} 
          className={activeTab === 'interactions' ? 'active' : ''}
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