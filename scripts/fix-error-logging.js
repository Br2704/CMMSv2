const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'WorkOrders.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Fix 1: confirmSafetyAndStartWork catch block
const oldCatch1 = `    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start work");
    } finally {
      setIsStartingWorkOrder(false);
    }
  };

  const handleSubmit = async () => {`;

const newCatch1 = `    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to start work";
      console.error("[startWorkOrder] Failed:", msg);
      if (error && typeof error === "object" && "payload" in error) {
        console.error("[startWorkOrder] Error payload:", (error as any).payload);
      }
      toast.error(msg);
    } finally {
      setIsStartingWorkOrder(false);
    }
  };

  const handleSubmit = async () => {`;

c = c.replace(oldCatch1, newCatch1);

// Fix 2: handleOpenWO catch block
const oldCatch2 = `    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to open work order");
    } finally {
      setIsStartingWorkOrder(false);
    }
  };`;

const newCatch2 = `    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to open work order";
      console.error("[handleOpenWO] startWorkOrder failed:", msg);
      if (error && typeof error === "object" && "payload" in error) {
        console.error("[handleOpenWO] Error payload:", (error as any).payload);
      }
      toast.error(msg);
    } finally {
      setIsStartingWorkOrder(false);
    }
  };`;

c = c.replace(oldCatch2, newCatch2);

fs.writeFileSync(filePath, c, 'utf8');

console.log("Applied fixes:");
console.log("  - confirmSafetyAndStartWork: added error logging");
console.log("  - handleOpenWO: added error logging");
