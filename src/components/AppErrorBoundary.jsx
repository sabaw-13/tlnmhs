import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application render failure:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-status-screen">
          <div className="app-status-card">
            <h1>Application Error</h1>
            <p>The app failed to render. Check the browser console for the exact error.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
