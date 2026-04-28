/**
 * Home Page — "The Safe Steps Journey"
 *
 * A fully immersive 3D storytelling experience.
 * Header floats on top in transparent mode.
 * The entire page is the JourneyScene (no native scrollbar).
 */
import Header from '../components/Header';
import JourneyScene from '../components/SafeStepsJourney/JourneyScene';

const Home = () => {
  return (
    <>
      {/* Transparent floating header — always on top of 3D scene */}
      <Header />

      {/* Full-screen immersive 3D journey */}
      <JourneyScene />

      {/* Global keyframe styles for the journey */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.7; }
        }
        /* Hide scrollbar globally on Home */
        body {
          overflow: hidden !important;
        }
      `}</style>
    </>
  );
};

export default Home;