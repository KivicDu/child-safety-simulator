import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';

// Lazy load Simulator to catch errors
const Simulator = lazy(() => import('./pages/Simulator'));

// Loading fallback
const LoadingPage = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <p>Loading...</p>
  </div>
);

// Error fallback
// const ErrorPage = () => (
//   <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
//     <h1>Oops! Something went wrong</h1>
//     <p>Please check the browser console (F12) for errors</p>
//     <button onClick={() => window.location.reload()}>Reload Page</button>
//   </div>
// );

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <Suspense fallback={<LoadingPage />}>
            <Simulator />
          </Suspense>
        } />
        <Route path="/simulator" element={
          <Suspense fallback={<LoadingPage />}>
            <Simulator />
          </Suspense>
        } />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;