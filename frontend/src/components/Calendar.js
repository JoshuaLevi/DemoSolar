import React, { useState, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../styles/Calendar.css';
import axios from 'axios';

// Set up the localizer
const localizer = momentLocalizer(moment);

// Sample dummy data for initial calendar events
const dummyAppointments = [
  {
    id: 1,
    title: 'Site Assessment - Johnson Family',
    start: new Date(new Date().setDate(new Date().getDate() + 1)),
    end: new Date(new Date().setDate(new Date().getDate() + 1) + 60 * 60 * 1000),
    type: 'site-visit',
    customer: 'johnson@example.com',
    phone: '555-123-4567',
    notes: 'New construction, interested in whole-home solution'
  },
  {
    id: 2,
    title: 'Virtual Consultation - Smith Residence',
    start: new Date(new Date().setDate(new Date().getDate() + 2)),
    end: new Date(new Date().setDate(new Date().getDate() + 2) + 60 * 60 * 1000),
    type: 'virtual',
    customer: 'smith@example.com',
    phone: '555-987-6543',
    notes: 'Referred by neighbor, has Tesla Model 3'
  },
  {
    id: 3,
    title: 'Panel Installation - Green Property',
    start: new Date(new Date().setDate(new Date().getDate() + 5)),
    end: new Date(new Date().setDate(new Date().getDate() + 5) + 240 * 60 * 1000),
    type: 'installation',
    customer: 'green@example.com',
    phone: '555-567-8901',
    notes: 'Requires roof reinforcement'
  },
  {
    id: 4,
    title: 'Maintenance Check - Davis Home',
    start: new Date(new Date().setDate(new Date().getDate() - 1)),
    end: new Date(new Date().setDate(new Date().getDate() - 1) + 90 * 60 * 1000),
    type: 'maintenance',
    customer: 'davis@example.com',
    phone: '555-345-6789',
    notes: 'Annual inspection'
  }
];

function AppointmentCalendar({ aiAppointments = [] }) {
  // Combine dummy appointments with AI-generated ones
  const [events, setEvents] = useState([
    ...dummyAppointments,
    ...aiAppointments.map((apt, index) => ({
      id: `ai-${apt.id || index}`,
      title: `AI Appointment - ${apt.userEmail}`,
      start: new Date(apt.scheduledTime),
      end: new Date(new Date(apt.scheduledTime).getTime() + 60 * 60 * 1000), // 1 hour duration
      type: apt.appointmentType || 'virtual',
      customer: apt.userEmail,
      phone: apt.phoneNumber || 'Not provided',
      notes: apt.notes || 'Scheduled by AI assistant'
    }))
  ]);
  
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    start: new Date(),
    end: new Date(),
    type: 'virtual',
    customer: '',
    phone: '',
    notes: ''
  });
  const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'add'
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // Fetch available time slots for a date
  const fetchAvailableSlots = async (date) => {
    try {
      setLoadingSlots(true);
      const formattedDate = moment(date).format('YYYY-MM-DD');
      const response = await axios.get(`/api/crm/available-slots?date=${formattedDate}`);
      setAvailableSlots(response.data);
    } catch (error) {
      console.error('Error fetching available slots:', error);
    } finally {
      setLoadingSlots(false);
    }
  };
  
  // Save an appointment to the backend
  const saveAppointmentToBackend = async (appointmentData) => {
    try {
      const response = await axios.post('/api/crm/appointments', appointmentData);
      return response.data;
    } catch (error) {
      console.error('Error saving appointment:', error);
      throw error;
    }
  };
  
  // Event handlers
  const handleSelectEvent = useCallback((event) => {
    setSelectedEvent(event);
    setFormData({
      ...event,
      start: new Date(event.start),
      end: new Date(event.end)
    });
    setModalMode('view');
    setShowModal(true);
  }, []);
  
  const handleSelectSlot = useCallback(({ start, end }) => {
    setSelectedEvent(null);
    setFormData({
      title: 'New Appointment',
      start,
      end,
      type: 'virtual',
      customer: '',
      phone: '',
      notes: ''
    });
    fetchAvailableSlots(start);
    setModalMode('add');
    setShowModal(true);
  }, []);
  
  // Check if a time slot is available
  const isTimeSlotAvailable = (time) => {
    if (availableSlots.length === 0) return true;
    
    const hour = new Date(time).getHours();
    const matchingSlot = availableSlots.find(slot => slot.hour === hour);
    
    return matchingSlot ? matchingSlot.available : true;
  };
  
  const handleCloseModal = () => {
    setShowModal(false);
    setAvailableSlots([]);
  };
  
  const handleEditMode = () => {
    fetchAvailableSlots(formData.start);
    setModalMode('edit');
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleDateChange = (name, date) => {
    setFormData({ ...formData, [name]: date });
    
    // If it's the start date that changed, fetch available slots
    if (name === 'start') {
      fetchAvailableSlots(date);
    }
  };
  
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    // Check if the selected time slot is available
    if (!isTimeSlotAvailable(formData.start)) {
      alert('This time slot is not available. Please select another time.');
      return;
    }
    
    try {
      if (modalMode === 'add') {
        // Add new event
        const newEventData = {
          title: formData.title,
          start: formData.start,
          end: formData.end,
          customer: formData.customer,
          phone: formData.phone,
          notes: formData.notes,
          type: formData.type
        };
        
        // Save to backend
        await saveAppointmentToBackend(newEventData);
        
        const newEvent = {
          ...formData,
          id: Date.now()
        };
        setEvents([...events, newEvent]);
      } else if (modalMode === 'edit') {
        // Update existing event
        const updatedEvent = { ...formData, id: selectedEvent.id };
        
        // Only if it's not a dummy event, save to backend
        if (!selectedEvent.id.toString().startsWith('ai-')) {
          await saveAppointmentToBackend({
            title: formData.title,
            start: formData.start,
            end: formData.end,
            customer: formData.customer,
            phone: formData.phone,
            notes: formData.notes,
            type: formData.type
          });
        }
        
        setEvents(events.map(event => 
          event.id === selectedEvent.id ? updatedEvent : event
        ));
      }
      
      setShowModal(false);
      setAvailableSlots([]);
    } catch (error) {
      alert('There was an error saving the appointment. Please try again.');
    }
  };
  
  const handleDeleteEvent = async () => {
    if (window.confirm('Are you sure you want to delete this appointment?')) {
      // In a real app, we would make a DELETE request to remove from backend
      
      setEvents(events.filter(event => event.id !== selectedEvent.id));
      setShowModal(false);
      setAvailableSlots([]);
    }
  };
  
  // Event styling
  const eventStyleGetter = (event) => {
    let style = {
      backgroundColor: '#3174ad',
      borderRadius: '4px',
      color: 'white',
      border: 'none',
      display: 'block'
    };
    
    switch(event.type) {
      case 'virtual':
        style.backgroundColor = '#28a745'; // green
        break;
      case 'site-visit':
        style.backgroundColor = '#007bff'; // blue
        break;
      case 'installation':
        style.backgroundColor = '#dc3545'; // red
        break;
      case 'maintenance':
        style.backgroundColor = '#ffc107'; // yellow
        style.color = 'black';
        break;
      default:
        break;
    }
    
    return { style };
  };
  
  // Modal content based on mode
  const renderModalContent = () => {
    if (modalMode === 'view') {
      return (
        <div className="event-details">
          <h3>{formData.title}</h3>
          <p><strong>Time:</strong> {moment(formData.start).format('MMMM Do YYYY, h:mm a')} - {moment(formData.end).format('h:mm a')}</p>
          <p><strong>Type:</strong> {formData.type}</p>
          <p><strong>Customer:</strong> {formData.customer}</p>
          <p><strong>Phone:</strong> {formData.phone}</p>
          <p><strong>Notes:</strong> {formData.notes}</p>
          <div className="button-group">
            <button type="button" onClick={handleEditMode} className="edit-button">Edit</button>
            <button type="button" onClick={handleDeleteEvent} className="delete-button">Delete</button>
            <button type="button" onClick={handleCloseModal} className="close-button">Close</button>
          </div>
        </div>
      );
    } else { // edit or add
      return (
        <form onSubmit={handleFormSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input 
              type="text" 
              name="title" 
              value={formData.title} 
              onChange={handleInputChange} 
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Date</label>
            <input 
              type="date" 
              name="startDate" 
              value={moment(formData.start).format('YYYY-MM-DD')} 
              onChange={(e) => {
                const newDate = new Date(formData.start);
                const selectedDate = new Date(e.target.value);
                newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                handleDateChange('start', newDate);
              }} 
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Time{loadingSlots && ' (Loading available slots...)'}</label>
            <select 
              name="startTime" 
              value={moment(formData.start).format('HH:00')} 
              onChange={(e) => {
                const [hours] = e.target.value.split(':').map(Number);
                const newDate = new Date(formData.start);
                newDate.setHours(hours, 0, 0, 0);
                
                // Set end time to 1 hour later
                const newEndDate = new Date(newDate);
                newEndDate.setHours(hours + 1, 0, 0, 0);
                
                setFormData({
                  ...formData,
                  start: newDate,
                  end: newEndDate
                });
              }}
              required
            >
              {Array.from({ length: 9 }, (_, i) => i + 9).map(hour => {
                // Skip lunch hour
                if (hour === 12) return null;
                
                const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                const displayTime = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
                const available = isTimeSlotAvailable(new Date(moment(formData.start).format('YYYY-MM-DD') + 'T' + timeStr));
                
                return (
                  <option 
                    key={hour} 
                    value={timeStr}
                    disabled={!available}
                  >
                    {displayTime} {!available ? '(Unavailable)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          
          <div className="form-group">
            <label>Type</label>
            <select name="type" value={formData.type} onChange={handleInputChange}>
              <option value="virtual">Virtual Consultation</option>
              <option value="site-visit">Site Visit</option>
              <option value="installation">Installation</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Customer Email</label>
            <input 
              type="email" 
              name="customer" 
              value={formData.customer} 
              onChange={handleInputChange} 
              required
            />
          </div>
          
          <div className="form-group">
            <label>Phone Number</label>
            <input 
              type="text" 
              name="phone" 
              value={formData.phone} 
              onChange={handleInputChange} 
            />
          </div>
          
          <div className="form-group">
            <label>Notes</label>
            <textarea 
              name="notes" 
              value={formData.notes} 
              onChange={handleInputChange} 
            />
          </div>
          
          <div className="button-group">
            <button type="submit" className="save-button">
              {modalMode === 'add' ? 'Add Appointment' : 'Save Changes'}
            </button>
            <button type="button" onClick={handleCloseModal} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      );
    }
  };
  
  return (
    <div className="calendar-container">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 600 }}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={handleSelectEvent}
        onSelectSlot={handleSelectSlot}
        selectable
        popup
        views={['month', 'week', 'day', 'agenda']}
      />
      
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={handleCloseModal}>×</button>
            {renderModalContent()}
          </div>
        </div>
      )}
      
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="color-box" style={{ backgroundColor: '#28a745' }}></span>
          <span>Virtual Consultation</span>
        </div>
        <div className="legend-item">
          <span className="color-box" style={{ backgroundColor: '#007bff' }}></span>
          <span>Site Visit</span>
        </div>
        <div className="legend-item">
          <span className="color-box" style={{ backgroundColor: '#dc3545' }}></span>
          <span>Installation</span>
        </div>
        <div className="legend-item">
          <span className="color-box" style={{ backgroundColor: '#ffc107' }}></span>
          <span>Maintenance</span>
        </div>
      </div>
    </div>
  );
}

export default AppointmentCalendar; 